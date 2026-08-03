"use client";

import { useState } from "react";
import { z } from "zod";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useData } from "@/lib/data-context";

const e164Schema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "Format nomor harus E.164, mis. +6281234567890");

export default function NotificationSettingsPage() {
  const { user, isLoading } = useRequireAuth();
  const { notificationPreferences, setNotificationPreference } = useData();

  const pref = notificationPreferences.find((p) => p.userId === user?.id) ?? {
    userId: user?.id ?? "",
    emailEnabled: true,
    whatsappEnabled: false,
    whatsappNumber: "",
  };

  const [whatsappNumber, setWhatsappNumber] = useState(pref.whatsappNumber);
  const [numberError, setNumberError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (isLoading || !user) {
    return <div className="p-8 text-sm text-zinc-500">Memuat…</div>;
  }

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleWhatsappToggle(enabled: boolean) {
    if (enabled) {
      const result = e164Schema.safeParse(whatsappNumber);
      if (!result.success) {
        setNumberError(result.error.issues[0].message);
        return;
      }
      setNumberError(null);
      // Persist the number together with the toggle — the field's onBlur
      // save may not have fired yet if the user tabs straight from the
      // number field to the toggle, so relying on it alone can enable
      // WhatsApp with no number saved.
      setNotificationPreference(user!.id, { whatsappEnabled: true, whatsappNumber: result.data });
    } else {
      setNumberError(null);
      setNotificationPreference(user!.id, { whatsappEnabled: false });
    }
    flashSaved();
  }

  function handleNumberBlur() {
    if (!pref.whatsappEnabled) return;
    const result = e164Schema.safeParse(whatsappNumber);
    if (!result.success) {
      setNumberError(result.error.issues[0].message);
      return;
    }
    setNumberError(null);
    setNotificationPreference(user!.id, { whatsappNumber });
    flashSaved();
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <h1 className="text-xl font-semibold text-zinc-900">Pengaturan Notifikasi</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Pilih kanal untuk menerima notifikasi assignment, perubahan status, dan item overdue. (US-E1)
      </p>

      <div className="mt-6 space-y-4">
        {saved && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200">
            Preferensi tersimpan.
          </div>
        )}

        <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4">
          <div>
            <p className="text-sm font-medium text-zinc-800">Email</p>
            <p className="text-xs text-zinc-400">Terkirim ke {user.email}</p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={pref.emailEnabled}
              onChange={(e) => {
                setNotificationPreference(user.id, { emailEnabled: e.target.checked });
                flashSaved();
              }}
              className="peer sr-only"
            />
            <div className="h-6 w-11 rounded-full bg-zinc-200 transition-colors peer-checked:bg-zinc-900" />
            <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
          </label>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-800">WhatsApp</p>
              <p className="text-xs text-zinc-400">
                Fallback otomatis ke email bila pengiriman WhatsApp gagal.
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={pref.whatsappEnabled}
                onChange={(e) => handleWhatsappToggle(e.target.checked)}
                className="peer sr-only"
              />
              <div className="h-6 w-11 rounded-full bg-zinc-200 transition-colors peer-checked:bg-zinc-900" />
              <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
            </label>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Nomor WhatsApp (format E.164)
            </label>
            <input
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              onBlur={handleNumberBlur}
              placeholder="+6281234567890"
              className={`w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none focus:ring-2 ${
                numberError ? "border-red-300 focus:ring-red-200" : "border-zinc-300 focus:ring-zinc-300"
              }`}
            />
            {numberError && <p className="mt-1 text-xs text-red-600">{numberError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
