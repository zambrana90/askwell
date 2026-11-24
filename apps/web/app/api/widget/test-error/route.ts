export const dynamic = "force-dynamic";

/** TEMPORARY (P4C-T06 preview check): removed before review. */
export function GET() {
  throw new Error("P4C-T06 temporary server test error");
}
