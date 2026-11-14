import { redirect } from "next/navigation";

export default async function StudioIndex(props: PageProps<"/studio/[projectId]">) {
  const { projectId } = await props.params;
  redirect(`/studio/${projectId}/lyrics`);
}
