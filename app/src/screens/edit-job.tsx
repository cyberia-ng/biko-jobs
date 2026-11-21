import { useContext, useReducer, useState, type ReactNode } from "react";
import { ImageBlob } from "../components/blob-loader.tsx";
import { AppContext } from "../context.ts";
import { type StreamAction, upsertJob, type Image } from "../service-state/persistent/action.ts";
import type { Job } from "../service-state/persistent/state.ts";
import omit from "lodash/omit.js";
import { jobDetail } from "../navigation/state.ts";
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
import { makeThumbnail } from "../utilities/make-thumbnail.ts";
import type { BlobUUID } from "../service-state/state.ts";
import type { Bytes } from "@biko-jobs/api-client";
import { streamAction } from "../service-state/reducer.ts";

type EditJobAction = Omit<
  Extract<Extract<StreamAction, { type: "job action" }>["jobAction"], { type: "upsert job" }>,
  "type" | "images"
> & {
  images: PhotosT;
};

export function EditJob(props: { new_?: boolean }) {
  const isNew = props.new_ ?? false;
  const { state, dispatch, navigate, navigationState, addNavigationHook } = useContext(AppContext);
  const loading = state.outbox.length !== 0;
  const [reloadForm, triggerReloadForm] = useReducer((prev) => !prev, false);
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
        navigate(to);
      }
      function cancel() {
        setUnsaved({ type: "dirty", unhook });
      }
      setUnsaved({ type: "navigating while dirty", override, cancel });
      return { prevent: true };
    });
    setUnsaved({ type: "dirty", unhook });
  }
  function submit(jobAction: EditJobAction, jobUUID: string) {
    if (isNew) {
      dispatch({ type: "persistent/create stream", name: jobUUID });
    }
    const images: Image[] = [];
    const newImageBlobs: Map<BlobUUID, Bytes> = new Map();
    let shouldReload = isNew;
    for (const photo of jobAction.images) {
      switch (photo.type) {
        case "new":
          newImageBlobs.set(photo.main.blobUUID, photo.main.data);
          newImageBlobs.set(photo.thumbnail.blobUUID, photo.thumbnail.data);
          shouldReload = true;
          URL.revokeObjectURL(photo.url);
          break;
        case "existing":
          images.push(photo.image);
          break;
      }
    }
    const action: StreamAction = upsertJob({ ...omit(jobAction, "images"), images });
    dispatch(streamAction(jobUUID, action, newImageBlobs));
    if (shouldReload) triggerReloadForm();
    if (unsaved.type === "dirty") unsaved.unhook();
    setUnsaved({ type: "clean" });
  }
  let content: ReactNode;
  let job: Job | undefined = undefined;
  if (isNew) {
    content = (
      <EditJobForm
        key={reloadForm ? "" : " "}
        onSubmit={submit}
        disabled={loading}
        onReset={() => triggerReloadForm()}
        onUnsaved={handleUnsaved}
      />
    );
  } else {
    if (navigationState.screen !== "edit job") {
      throw new Error("unreachable");
    }
    job = state.persistent.jobs.get(navigationState.uuid);
    if (job === undefined) {
      content = "Job does not exist";
    } else {
      content = (
        <EditJobForm
          key={reloadForm ? "" : " "}
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
  photos: PhotosT;
};
type FormAction = { type: "partial" } & Partial<FormData>;
function formReducer(state: FormData, action: FormAction): FormData {
  return produce(state, (state) => {
    switch (action.type) {
      case "partial":
        Object.assign(state, omit(action, "type"));
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
  onSubmit: (job: EditJobAction, jobUUID: string) => void;
  onReset?: () => void;
  disabled: boolean;
  onUnsaved: () => void;
}) {
  const [formData, dispatchFormData_] = useReducer(formReducer, {
    name: job?.customerName ?? "",
    phoneNumber: job?.customerPhoneNumber ?? "",
    description: job?.description ?? "",
    photos: job?.images.map((image) => ({ type: "existing" as const, image, job: job.uuid })) ?? [],
  });
  function dispatchFormData(action: FormAction) {
    onUnsaved();
    dispatchFormData_(action);
  }
  function submit() {
    const jobAction: EditJobAction = {
      customerName: formData.name,
      customerPhoneNumber: formData.phoneNumber,
      description: formData.description,
      images: formData.photos,
    };
    onSubmit(jobAction, job?.uuid ?? crypto.randomUUID());
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
        <Photos
          photos={formData.photos}
          onChange={(photos) => dispatchFormData({ type: "partial", photos })}
          disabled={disabled}
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
  | {
      type: "new";
      key: string;
      main: { blobUUID: BlobUUID; data: Bytes; type: string };
      thumbnail: { blobUUID: BlobUUID; data: Bytes; type: string };
      url: string;
    };
type PhotosT = Array<Photo>;
function Photos({
  photos,
  onChange,
  disabled,
}: {
  photos: PhotosT;
  onChange: (photos: PhotosT) => void;
  disabled: boolean;
}) {
  function deletePhoto(id: string) {
    const photo = photos.find((photo) => photoId(photo) === id);
    if (photo !== undefined) {
      if (photo.type === "new") {
        URL.revokeObjectURL(photo.url);
      }
      onChange(photos.filter((p) => p !== photo));
    }
  }
  async function addPhoto(blob: Blob) {
    const uuid = crypto.randomUUID();
    const url = URL.createObjectURL(blob);
    const { data: thumbnailData, type: thumbnailType } = await makeThumbnail(url);
    const mainData = await blob.bytes();
    onChange([
      ...photos,
      {
        type: "new",
        key: uuid,
        main: { blobUUID: crypto.randomUUID(), data: mainData, type: blob.type },
        thumbnail: { blobUUID: crypto.randomUUID(), data: thumbnailData, type: thumbnailType },
        url,
      },
    ]);
  }
  function photoId(photo: Photo) {
    switch (photo.type) {
      case "new":
        return photo.key;
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
              <div className="position-relative">
                {disabled && (
                  <div className="position-absolute h-100 w-100 top-0 left-0 bg-secondary-subtle opacity-75"></div>
                )}
                {photo.type === "new" ? (
                  <img src={photo.url} className="img-fluid h-100 w-100 object-fit-cover" />
                ) : (
                  <ImageBlob jobUUID={photo.job} blobUUID={photo.image.blobId} type="image/jpeg" />
                )}
              </div>
            </div>
            <div className="col-4 d-flex">
              <button
                type="button"
                className="btn btn-danger align-self-center"
                onClick={() => deletePhoto(photoId(photo))}
                disabled={disabled}
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
              addPhoto(file).catch(console.error);
            }
          }}
          disabled={disabled}
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
