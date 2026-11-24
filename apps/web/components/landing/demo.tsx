import { APP_NAME } from "@askwell/shared";
import { Section } from "./section";

/** Points visitors to the real widget in the corner of the page. No mock. */
export function Demo({ live }: { live: boolean }) {
  return (
    <Section
      id="demo"
      title="Live demo"
      intro={
        live
          ? `Try it now: the chat button in the corner of this page is the real ${APP_NAME} widget. It answers from a project about ${APP_NAME} itself. Ask it about pricing or how to install it.`
          : "The live demo is not available right now."
      }
    />
  );
}
