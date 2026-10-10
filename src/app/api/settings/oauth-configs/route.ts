import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/shared/utils/apiAuth";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import {
  listProviderOAuthConfigs,
  setProviderOAuthConfig,
  deleteProviderOAuthConfig,
} from "@/lib/db/providerOAuthConfigs";

const saveOAuthConfigSchema = z.object({
  provider: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configs = listProviderOAuthConfigs();
  return NextResponse.json({ configs });
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const validated = await validateBody(request, saveOAuthConfigSchema);
  if (isValidationFailure(validated)) {
    return validated.response;
  }

  const { provider, clientId, clientSecret } = validated.data;
  setProviderOAuthConfig(provider, clientId, clientSecret);

  return NextResponse.json({
    success: true,
    provider: provider.toLowerCase().trim(),
    clientId,
  });
}

export async function DELETE(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");
  if (!provider) {
    return NextResponse.json({ error: "Missing provider query parameter" }, { status: 400 });
  }

  const deleted = deleteProviderOAuthConfig(provider);
  return NextResponse.json({ success: deleted, provider });
}
