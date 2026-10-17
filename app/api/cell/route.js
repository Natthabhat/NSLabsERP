import { readCell, saveCell } from "../../../lib/data.mjs";
import { checkOrigin, AppError } from "../../../lib/security.mjs";
import { json, failure } from "../../../lib/http.mjs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const p = new URL(request.url).searchParams;
    return json(
      await readCell(
        Number(p.get("tab")),
        Number(p.get("row")),
        Number(p.get("column")),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request) {
  try {
    checkOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new AppError("Use a JSON request.", 415);
    const body = await request.text();
    if (body.length > 20000)
      throw new AppError("Save request is too large.", 413);
    return json(await saveCell(JSON.parse(body)));
  } catch (e) {
    return failure(e);
  }
}
