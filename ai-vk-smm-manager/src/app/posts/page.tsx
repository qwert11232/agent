import { redirect } from "next/navigation";

export default function Page() {
  redirect("/content?tab=posts");
}
