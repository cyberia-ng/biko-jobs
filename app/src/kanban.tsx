export function Kanban() {
  return (
    <div className="row bg-body-secondary vh-100 p-3">
      <Column title="Triaged" />
      <Column title="Working" />
      <Column title="Complete" />
    </div>
  );
}

function Column(props: { title: string }) {
  return (
    <div className="col d-flex flex-column m-2 p-3 bg-body shadow-sm rounded">
      <div className="border-bottom mb-3">
        <h4>{props.title}</h4>
      </div>
      <div className="flex-grow-1">
        <div className="row">
          <div className="col-2">image</div>
          <div className="col">
            <div>Title</div>
            <div>Description</div>
          </div>
        </div>
      </div>
    </div>
  );
}
