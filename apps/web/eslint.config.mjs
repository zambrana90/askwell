import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import root from "../../eslint.config.mjs";

const SECRET = "SUPABASE_SECRET_KEY";

const config = [
  ...root,
  ...nextVitals,
  ...nextTs,
  {
    // The Supabase secret key skips RLS: only lib/supabase/service.ts may read it (project.md §9).
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `MemberExpression[property.name='${SECRET}']`,
          message: "SUPABASE_SECRET_KEY may only be read in lib/supabase/service.ts.",
        },
        {
          // Template literals, e.g. process.env[`SUPABASE_SECRET_KEY`].
          selector: `TemplateElement[value.raw=/${SECRET}/]`,
          message: "SUPABASE_SECRET_KEY may only be referenced in lib/supabase/service.ts.",
        },
        {
          selector: `Literal[value=/${SECRET}/]`,
          message: "SUPABASE_SECRET_KEY may only be referenced in lib/supabase/service.ts.",
        },
        {
          selector: `Identifier[name='${SECRET}']`,
          message: "SUPABASE_SECRET_KEY may only be referenced in lib/supabase/service.ts.",
        },
      ],
    },
  },
  { files: ["lib/supabase/service.ts", "eslint.config.mjs"], rules: { "no-restricted-syntax": "off" } },
];

export default config;
