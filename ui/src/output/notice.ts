// Notices that stand in for a view's content, such as a diagram that could not be drawn.

/** A notice with [[title]] and the error [[message]], for a diagram or a page that failed. */
export function errorNotice(title: string, message: string): HTMLElement {
  const notice = document.createElement("div");
  notice.className = "diagram-notice diagram-notice--error";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const detail = document.createElement("code");
  detail.textContent = message;
  notice.append(heading, detail);
  return notice;
}
