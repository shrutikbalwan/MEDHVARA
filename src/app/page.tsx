import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Root entry: send signed-in users to the dashboard, everyone else to login.
 * Replaces the create-next-app splash page.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
