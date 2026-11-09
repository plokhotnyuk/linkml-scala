// The read-only editor that shows generated text. Views that are not text, such as the diagram, use
// it for their Code half (see view-tabs.ts).
import { createOutput } from "../lib/editor.js";
import { $ } from "../lib/dom.js";

export const $outputEditorHost = $("outputEditor");
export const outputView = createOutput($outputEditorHost);

/** Call `then` once the output editor is in view, or after 30 frames if it isn't by then.
 *
 * The editor draws only the lines that can be seen. While it is not in view, as after being hidden,
 * it draws all of them, and for a large schema that takes seconds. It finds out that it is in view
 * a few frames after being shown. */
export function whenOutputInView(then: () => void): void {
  let frames = 0;
  const check = () => {
    if (outputView.inView || ++frames >= 30) then();
    else requestAnimationFrame(check);
  };
  check();
}
