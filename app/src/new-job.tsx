import { useState } from "react";
import uniqueId from "lodash/uniqueId.js";
import type { NewJob } from "./state/action.ts";

export function NewJob(props: { onSubmit: (job: Omit<NewJob, "type">) => void }) {
  const [customerName, setCustomerName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [photos, setPhotos] = useState<Array<{ id: string; data: Uint8Array<ArrayBuffer> }>>([]);
  return (
    <div className="bg-white m-2 p-2 rounded">
      <form onSubmit={(e) => e.preventDefault()}>
        <div className="mb-3">
          <label htmlFor="customerName" className="form-label">
            Customer name
          </label>
          <input
            type="text"
            className="form-control"
            id="customerName"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </div>
        <div className="mb-3">
          <label htmlFor="description" className="form-label">
            Job description
          </label>
          <textarea
            name="description"
            className="form-control"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="row mb-3">
          {photos.map(({ id, data }) => (
            <div className="row mb-3" key={id}>
              <img
                src={`data:image/jpeg;base64,${data.toBase64()}`}
                className="object-fit-cover col-8"
              />
              <div className="col-4 d-flex">
                <button
                  className="btn btn-danger align-self-center"
                  onClick={() => setPhotos(photos.filter(({ id: photoId }) => photoId !== id))}
                >
                  <i className="bi bi-trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mb-3">
          <label htmlFor="photos" className="form-label">
            Photos
          </label>
          <input
            name="photos"
            multiple
            type="file"
            accept="image/jpeg"
            capture="environment"
            className="form-control"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file !== undefined) {
                file.bytes().then((data) => setPhotos([...photos, { id: uniqueId(), data }]));
              }
            }}
          />
        </div>
        <div className="mb-3">
          <button
            className="btn btn-primary me-3"
            onClick={() => {
              props.onSubmit({
                customerName,
                description,
                images: photos.map(({ data }) => ({ type: "image/jpeg", data })),
              });
            }}
          >
            Submit
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              setCustomerName("");
              setDescription("");
              setPhotos([]);
            }}
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
