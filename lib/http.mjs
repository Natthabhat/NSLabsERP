import { NextResponse } from "next/server";
export function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function failure(error) {
  const known = Number.isInteger(error.status);
  return json(
    {
      error: known
        ? error.message
        : "The request could not be completed. Refresh and try again.",
    },
    known ? error.status : 500,
  );
}
