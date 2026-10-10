import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/shared/utils/apiAuth";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { listProjects, createProject } from "@/lib/db/projects";

const createProjectSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = listProjects();
  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const validated = await validateBody(request, createProjectSchema);
  if (isValidationFailure(validated)) {
    return validated.response;
  }

  const project = createProject(validated.data);
  return NextResponse.json({ project }, { status: 201 });
}
