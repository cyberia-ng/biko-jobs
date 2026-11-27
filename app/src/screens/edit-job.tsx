import { useContext, useEffect, useReducer, useState, type ReactNode } from "react";
import { ImageBlob } from "../components/blob-loader.tsx";
import { AppContext } from "../context.ts";
import { upsertJob, type Image, type UpsertJob } from "../service-state/persistent/action.ts";
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
import { streamAction } from "../service-state/reducer.ts";
import type { BlobUUID } from "../service-state/state.ts";

export function EditJob(props: { new_?: boolean }) {
  const isNew = props.new_ ?? false;
  const { state, dispatch, navigate, navigationState, addNavigationHook } = useContext(AppContext);
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
  function submit(job: UpsertJob, jobUUID: string, newPhotos: NewPhotos) {
    if (isNew) dispatch({ type: "persistent/create stream", name: jobUUID });
    dispatch(streamAction(jobUUID, upsertJob(job)));
    for (const photo of newPhotos) {
      dispatch({
        type: "photo/process photo",
        streamName: jobUUID,
        fullSizeUUID: photo.fullSizeUUID,
        thumbnailUUID: photo.thumbnailUUID,
        blob: photo.blob,
      });
    }
    if (unsaved.type === "dirty") unsaved.unhook();
    setUnsaved({ type: "clean" });
    if (isNew) triggerReloadForm();
  }
  let content: ReactNode;
  let job: Job | undefined = undefined;
  if (isNew) {
    content = (
      <EditJobForm
        key={reloadForm ? "" : " "}
        onSubmit={submit}
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

type NewPhotos = Array<{ fullSizeUUID: BlobUUID; thumbnailUUID: BlobUUID; blob: Blob }>;
function EditJobForm({
  job,
  onSubmit,
  onReset,
  onUnsaved,
}: {
  job?: Job;
  onSubmit: (jobAction: UpsertJob, jobUUID: string, newPhotos: NewPhotos) => void;
  onReset?: () => void;
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
    const newPhotos: NewPhotos = [];
    const images: UpsertJob["images"] = [];
    for (const photo of formData.photos) {
      switch (photo.type) {
        case "existing":
          images.push(photo.image);
          break;
        case "new": {
          const fullSizeUUID = crypto.randomUUID();
          const thumbnailUUID = crypto.randomUUID();
          images.push({
            type: "image/jpeg",
            blobId: fullSizeUUID,
            thumbnail: {
              type: "image/jpeg",
              blobId: thumbnailUUID,
            },
          });
          newPhotos.push({ fullSizeUUID, thumbnailUUID, blob: photo.blob });
          break;
        }
        default:
          photo satisfies never;
      }
    }
    const jobAction: UpsertJob = {
      customerName: formData.name,
      customerPhoneNumber: formData.phoneNumber,
      description: formData.description,
      images,
    };
    onSubmit(jobAction, job?.uuid ?? crypto.randomUUID(), newPhotos);
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
            onChange={(e) => dispatchFormData({ type: "partial", description: e.target.value })}
          />
        </div>
        <Photos
          photos={formData.photos}
          onChange={(photos) => dispatchFormData({ type: "partial", photos })}
        />
        <div className="mb-3">
          <button type="submit" className="btn btn-primary me-3" onClick={() => submit()}>
            {job === undefined ? "Submit" : "Save"}
          </button>
          {job === undefined && (
            <button type="button" className="btn btn-danger" onClick={() => onReset?.()}>
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
  | { type: "new"; key: string; blob: Blob };
type PhotosT = Array<Photo>;
function Photos({ photos, onChange }: { photos: PhotosT; onChange: (photos: PhotosT) => void }) {
  function deletePhoto(key: string) {
    onChange(photos.filter((p) => photoId(p) !== key));
  }
  function addPhoto(blob: Blob) {
    const key = crypto.randomUUID();
    onChange([...photos, { type: "new", key, blob }]);
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
                {photo.type === "new" ? (
                  <LocalImageBlob blob={photo.blob} />
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

function LocalImageBlob({ blob }: { blob: Blob }) {
  const url = URL.createObjectURL(blob);
  useEffect(() => () => URL.revokeObjectURL(url));
  return <img src={url} className="img-fluid h-100 w-100 object-fit-cover" />;
}
