import { Suspense } from "react";
import { RegisterView } from "@/components/register/RegisterView";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Memuat…</div>}>
      <RegisterView />
    </Suspense>
  );
}
