import { useContext, useReducer, useState, type ReactNode } from "react";
import { ImageBlob } from "../components/blob-loader.tsx";
import { AppContext } from "../context.ts";
import { upsertJob, type Image, type JobAction } from "../service-state/action.ts";
import { Tags } from "../components/tag-control.tsx";
import type { Job } from "../service-state/state.ts";
import omit from "lodash/omit.js";
import {
  deserialize,
  initialState as initialNavigationState,
  jobDetail,
} from "../navigation-state.ts";
import { Page } from "../components/page.tsx";
import { produce } from "immer";
import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalConfirmButton,
  ModalDismissButton,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "../components/modal.tsx";

type EditJobAction = Omit<
  Extract<JobAction["event"], { type: "upsert job" }>,
  "type" | "images"
> & {
  images: PhotosT;
};

export function EditJob(props: { new_?: boolean }) {
  const isNew = props.new_ ?? false;
  const { service, navigate, navigationState, addNavigationHook } = useContext(AppContext);
  const [loading, setLoading] = useState<boolean>(false);
  const [formReset, setFormReset] = useState(false);
  const [unsaved, setUnsaved] = useState<
    | { type: "clean" }
    | { type: "dirty"; unhook: () => void }
    | { type: "navigating while dirty"; override: () => void; cancel: () => void }
  >({ type: "clean" });
  function handleUnsaved() {
    if (unsaved.type !== "clean") return;
    const unhook = addNavigationHook(({ to, unhook }) => {
      function override() {
        unhook();
        navigate(deserialize(to) ?? initialNavigationState);
      }
      function cancel() {
        setUnsaved({ type: "dirty", unhook });
      }
      setUnsaved({ type: "navigating while dirty", override, cancel });
      return { prevent: true };
    });
    setUnsaved({ type: "dirty", unhook });
  }
  if (service === undefined) {
    return <Page>not connected</Page>;
  }
  function submit(jobAction: EditJobAction) {
    (async () => {
      setLoading(true);
      if (isNew) {
        await service.createJob(jobAction.uuid);
      }
      const images: Image[] = [];
      for (const photo of jobAction.images) {
        switch (photo.type) {
          case "new":
            const blobUUID = crypto.randomUUID();
            const data = await photo.blob.bytes();
            await service.putBlob(blobUUID, jobAction.uuid, data);
            images.push({ type: "image/jpeg", blobId: blobUUID });
            break;
          case "existing":
            images.push(photo.image);
            break;
        }
      }
      const action: JobAction = upsertJob({ ...omit(jobAction, "images"), images });
      service.dispatch(action);
      if (isNew) {
        setFormReset(!formReset);
      }
      if (unsaved.type === "dirty") unsaved.unhook();
      setUnsaved({ type: "clean" });
      setLoading(false);
    })().catch(console.error);
  }
  let content: ReactNode;
  let job: Job | undefined = undefined;
  if (isNew) {
    content = (
      <EditJobForm
        key={formReset ? "" : " "}
        onSubmit={submit}
        disabled={loading}
        onReset={() => setFormReset(!formReset)}
        onUnsaved={handleUnsaved}
      />
    );
  } else {
    if (navigationState.screen !== "edit job") {
      throw new Error("unreachable");
    }
    job = service.state.jobs.get(navigationState.uuid);
    if (job === undefined) {
      content = "Job does not exist";
    } else {
      content = (
        <EditJobForm
          key={job.uuid}
          job={job}
          onSubmit={submit}
          disabled={loading}
          onUnsaved={handleUnsaved}
        />
      );
    }
  }
  return (
    <Page>
      {unsaved.type === "navigating while dirty" && (
        <Unsaved onOverride={unsaved.override} onCancel={unsaved.cancel} />
      )}
      {job !== undefined && (
        <div className="mb-2">
          <button className="btn btn-primary" onClick={() => navigate(jobDetail(job.uuid))}>
            <i className="bi bi-caret-left-fill" />
            Back
          </button>
        </div>
      )}
      {content}
    </Page>
  );
}

type FormData = {
  name: string;
  phoneNumber: string;
  description: string;
  tags: Set<string>;
  photos: PhotosT;
};
type FormAction =
  | ({ type: "partial" } & Partial<Omit<FormData, "tags">>)
  | { type: "add tag"; tag: string }
  | { type: "remove tag"; tag: string };
function formReducer(state: FormData, action: FormAction): FormData {
  return produce(state, (state) => {
    switch (action.type) {
      case "partial":
        Object.assign(state, omit(action, "type"));
        break;
      case "add tag":
        state.tags.add(action.tag);
        break;
      case "remove tag":
        state.tags.delete(action.tag);
        break;
    }
  });
}

function EditJobForm({
  job,
  onSubmit,
  onReset,
  disabled,
  onUnsaved,
}: {
  job?: Job;
  onSubmit: (job: EditJobAction) => void;
  onReset?: () => void;
  disabled: boolean;
  onUnsaved: () => void;
}) {
  const [formData, dispatchFormData_] = useReducer(formReducer, {
    name: job?.customerName ?? "",
    phoneNumber: job?.customerPhoneNumber ?? "",
    description: job?.description ?? "",
    tags: job?.tags ?? new Set(),
    photos: job?.images.map((image) => ({ type: "existing" as const, image, job: job.uuid })) ?? [],
  });
  function dispatchFormData(action: FormAction) {
    onUnsaved();
    dispatchFormData_(action);
  }
  function submit() {
    const jobAction: EditJobAction = {
      uuid: job?.uuid ?? crypto.randomUUID(),
      tags: formData.tags,
      customerName: formData.name,
      customerPhoneNumber: formData.phoneNumber,
      description: formData.description,
      images: formData.photos,
    };
    onSubmit(jobAction);
  }
  return (
    <div>
      <form onSubmit={(e) => e.preventDefault()}>
        <div className="mb-3">
          <label htmlFor="customerName" className="form-label">
            Customer name
          </label>
          <input
            type="text"
            className="form-control"
            id="customerName"
            value={formData.name}
            disabled={disabled}
            onChange={(e) => dispatchFormData({ type: "partial", name: e.target.value })}
          />
        </div>
        <div className="mb-3">
          <label htmlFor="customerPhoneNumber" className="form-label">
            Customer phone number
          </label>
          <input
            type="tel"
            className="form-control"
            id="customerPhoneNumber"
            value={formData.phoneNumber}
            disabled={disabled}
            onChange={(e) => dispatchFormData({ type: "partial", phoneNumber: e.target.value })}
          />
        </div>
        <div className="mb-3">
          <label htmlFor="description" className="form-label">
            Job description
          </label>
          <textarea
            id="description"
            className="form-control"
            rows={5}
            value={formData.description}
            disabled={disabled}
            onChange={(e) => dispatchFormData({ type: "partial", description: e.target.value })}
          />
        </div>
        <div className="mb-3 edit-job-tags">
          <Tags
            tags={formData.tags}
            onAddTag={(tag) => dispatchFormData({ type: "add tag", tag })}
            onDeleteTag={(tag) => dispatchFormData({ type: "remove tag", tag })}
            disabled={disabled}
          />
        </div>
        <Photos
          photos={formData.photos}
          onChange={(photos) => dispatchFormData({ type: "partial", photos })}
        />
        <div className="mb-3">
          <button
            type="submit"
            className="btn btn-primary me-3"
            onClick={() => submit()}
            disabled={disabled}
          >
            {job === undefined ? "Submit" : "Save"}
          </button>
          {job === undefined && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => onReset?.()}
              disabled={disabled}
            >
              Reset
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

type Photo =
  | { type: "existing"; image: Image; job: string }
  | { type: "new"; uuid: string; blob: Blob; url: string };
type PhotosT = Array<Photo>;
function Photos({ photos, onChange }: { photos: PhotosT; onChange: (photos: PhotosT) => void }) {
  function deletePhoto(id: string) {
    const photo = photos.find((photo) => photoId(photo) === id);
    if (photo !== undefined) {
      if (photo.type === "new") {
        URL.revokeObjectURL(photo.url);
      }
      onChange(photos.filter((p) => p !== photo));
    }
  }
  function addPhoto(blob: Blob) {
    const uuid = crypto.randomUUID();
    const url = URL.createObjectURL(blob);
    onChange([...photos, { type: "new", uuid, blob, url }]);
  }
  function photoId(photo: Photo) {
    switch (photo.type) {
      case "new":
        return photo.uuid;
      case "existing":
        return photo.image.blobId;
    }
  }
  return (
    <>
      <div className="row mb-3">
        {photos.map((photo) => (
          <div className="row mb-3" key={photoId(photo)}>
            <div className="col-8">
              {photo.type === "new" ? (
                <img src={photo.url} className="img-fluid h-100 w-100 object-fit-cover" />
              ) : (
                <ImageBlob jobUUID={photo.job} blobUUID={photo.image.blobId} type="image/jpeg" />
              )}
            </div>
            <div className="col-4 d-flex">
              <button
                type="button"
                className="btn btn-danger align-self-center"
                onClick={() => deletePhoto(photoId(photo))}
              >
                <i className="bi bi-trash" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mb-3">
        <label htmlFor="photos" className="form-label">
          Attach photo
        </label>
        <input
          id="photos"
          multiple
          type="file"
          accept="image/jpeg"
          capture="environment"
          className="form-control"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file !== undefined) {
              addPhoto(file);
            }
          }}
        />
      </div>
    </>
  );
}

function Unsaved({ onOverride, onCancel }: { onOverride: () => void; onCancel: () => void }) {
  return (
    <Modal onConfirm={onOverride} onDismiss={onCancel}>
      <ModalHeader>
        <ModalTitle>Unsaved changes</ModalTitle>
        <ModalCloseButton />
      </ModalHeader>
      <ModalBody>This page has unsaved changes. Do you want to discard them?</ModalBody>
      <ModalFooter>
        <ModalDismissButton>Cancel</ModalDismissButton>
        <ModalConfirmButton className="btn btn-danger">Discard</ModalConfirmButton>
      </ModalFooter>
    </Modal>
  );
}
