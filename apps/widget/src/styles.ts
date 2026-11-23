// All widget CSS lives in the shadow root, so it never touches the host page and the
// host page's CSS never reaches it. Hex colors here are the widget's own chrome.
export const STYLES = `
:host{all:initial}
*{box-sizing:border-box}
.btn{position:fixed;z-index:2147483647;display:inline-flex;align-items:center;gap:8px;height:48px;padding:0 20px;border:0;border-radius:24px;background:var(--c);color:var(--t);font:600 14px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;box-shadow:0 4px 16px rgb(0 0 0/.25);transition:transform .15s}
.btn:hover{transform:translateY(-1px)}
.btn:focus-visible{outline:2px solid var(--c);outline-offset:3px}
.badge{position:absolute;top:-6px;right:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#e11d48;color:#fff;font:700 12px/20px system-ui,sans-serif;text-align:center}
.badge[hidden]{display:none}
.panel{position:fixed;z-index:2147483647;width:min(380px,calc(100vw - 40px));height:var(--h);max-height:calc(100vh - 104px);border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgb(0 0 0/.3);opacity:0;visibility:hidden;transition:opacity .2s,transform .2s,visibility 0s .2s}
[data-open] .panel{opacity:1;visibility:visible;transition-delay:0s}
iframe{display:block;width:100%;height:100%;border:0}
[data-pos$=right] .btn,[data-pos$=right] .panel{right:20px}
[data-pos$=left] .btn,[data-pos$=left] .panel{left:20px}
[data-pos^=bottom] .btn{bottom:20px}[data-pos^=bottom] .panel{bottom:84px}
[data-pos^=top] .btn{top:20px}[data-pos^=top] .panel{top:84px}
[data-anim=slide][data-pos^=bottom]:not([data-open]) .panel{transform:translateY(16px)}
[data-anim=slide][data-pos^=top]:not([data-open]) .panel{transform:translateY(-16px)}
[data-anim=scale]:not([data-open]) .panel{transform:scale(.9)}
[data-anim=scale][data-pos=bottom-right] .panel{transform-origin:bottom right}
[data-anim=scale][data-pos=bottom-left] .panel{transform-origin:bottom left}
[data-anim=scale][data-pos=top-right] .panel{transform-origin:top right}
[data-anim=scale][data-pos=top-left] .panel{transform-origin:top left}
@media (max-width:480px){
.panel{inset:8px!important;width:auto!important;height:auto!important;max-height:none!important}
[data-open] .btn{display:none}
}
@media (prefers-reduced-motion:reduce){.panel,.btn{transition:none!important}}
`;
