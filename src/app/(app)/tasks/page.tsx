import { redirect } from "next/navigation";

// Today and next actions now live on the board, as its Today tab.
export default function Moved() {
  redirect("/l/INBOX");
}
