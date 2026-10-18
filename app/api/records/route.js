import { readRecords } from "../../../lib/data.mjs";
import { json, failure } from "../../../lib/http.mjs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const p = new URL(request.url).searchParams;
    return json(
      await readRecords(
        Number(p.get("tab")),
        Number(p.get("page") || 0),
        p.get("query") || "",
        {sort:p.has("sort")?Number(p.get("sort")):null,direction:p.get("direction")||"desc",filters:JSON.parse(p.get("filters")||"{}")},
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
