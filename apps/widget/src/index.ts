import { init } from "./widget";

// widget.js: find our own <script> tag and start. Nothing runs if it is not found.
const script =
  document.currentScript instanceof HTMLScriptElement
    ? document.currentScript
    : Array.from(document.querySelectorAll<HTMLScriptElement>("script[data-key]")).find((s) =>
        /\/widget\.js(?:$|\?)/.test(s.src),
      );
if (script) void init(script);
