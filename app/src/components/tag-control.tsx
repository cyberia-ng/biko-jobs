import { useContext } from "react";
import { AppContext } from "../context.ts";
import { DropdownFreeText } from "./dropdown-freetext.tsx";

const alwaysSuggestedTags = new Set(["difficult", "easy"]);

export function Tags({
  tags,
  onDeleteTag,
  onAddTag,
  dropdownClassAll,
}: {
  tags: Set<string>;
  onDeleteTag: (tag: string) => void;
  onAddTag: (tag: string) => void;
  dropdownClassAll?: string | undefined;
}) {
  const { session } = useContext(AppContext);
  const knownTags =
    session?.state.jobs
      .values()
      .map((job) => job.tags)
      .reduce((knownTags, jobTags) => knownTags.union(jobTags), new Set()) ?? new Set();
  return (
    <div className="">
      <div className={tags.size === 0 ? "" : "mb-2"}>
        <DropdownFreeText
          select="Add tag"
          options={Array.from(knownTags.union(alwaysSuggestedTags))}
          onSelect={(value) => onAddTag(value)}
          classAll={dropdownClassAll}
        />
      </div>
      <div className="d-flex flex-wrap gap-1">
        {Array.from(tags).map((tag) => (
          <div
            key={tag}
            className="px-2 bg-secondary-subtle text-secondary-emphasis rounded-pill d-flex align-items-center"
          >
            <div>{tag}</div>
            <div style={{ translate: "0px 0.05lh" }}>
              <a
                href="#"
                className="text-danger"
                onClick={(e) => {
                  e.preventDefault();
                  onDeleteTag(tag);
                }}
              >
                <i className="bi bi-x fs-4" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
