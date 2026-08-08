import { redirect } from "next/navigation";

/**
 * There is no product home until there is a session to render one for. FE-02
 * replaces this with a real authenticated entry point.
 */
export default function Page() {
  redirect("/login");
}
