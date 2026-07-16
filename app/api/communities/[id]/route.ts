import { NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { getCommunityDetail } from "@/lib/communities";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: communityId } = await params;
  const viewerId = await getUserIdFromRequest(request);

  const community = await getCommunityDetail(communityId, viewerId);

  if (!community) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Спільноту не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ community });
}
