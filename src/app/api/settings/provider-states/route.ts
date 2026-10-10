import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/shared/utils/apiAuth";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { listProviderStates, setProviderEnabled } from "@/lib/db/providerStates";

const updateProviderStateSchema = z.object({
  provider: z.string().min(1),
  enabled: z.boolean(),
});

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const states = listProviderStates();
  return NextResponse.json({ states });
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const validated = await validateBody(request, updateProviderStateSchema);
  if (isValidationFailure(validated)) {
    return validated.response;
  }

  const { provider, enabled } = validated.data;
  setProviderEnabled(provider, enabled);

  return NextResponse.json({
    success: true,
    provider: provider.toLowerCase().trim(),
    enabled,
  });
}
