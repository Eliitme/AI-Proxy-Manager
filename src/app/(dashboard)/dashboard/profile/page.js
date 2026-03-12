"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button, Toggle, Input } from "@/shared/components";
import { useTheme } from "@/shared/hooks/useTheme";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG } from "@/shared/constants/config";

export default function ProfilePage() {
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [userHasPassword, setUserHasPassword] = useState(null);
  const [requireLogin, setRequireLogin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [passStatus, setPassStatus] = useState({ type: "", message: "" });
  const [passLoading, setPassLoading] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState({ type: "", message: "" });
  const importFileRef = useRef(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((res) => res.json()),
      fetch("/api/profile").then((res) => (res.ok ? res.json() : { hasPassword: false })),
    ])
      .then(([settingsData, profileData]) => {
        setRequireLogin(!!settingsData?.requireLogin);
        setUserHasPassword(!!profileData?.hasPassword);
        setIsAdmin(!!profileData?.isAdmin);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setPassStatus({ type: "error", message: "Passwords do not match" });
      return;
    }
    if (userHasPassword && !passwords.current?.trim()) {
      setPassStatus({ type: "error", message: "Current password is required" });
      return;
    }

    setPassLoading(true);
    setPassStatus({ type: "", message: "" });

    try {
      const body = { newPassword: passwords.new };
      if (userHasPassword) body.currentPassword = passwords.current;
      const res = await fetch("/api/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok) {
        setPassStatus({ type: "success", message: userHasPassword ? "Password updated successfully" : "Password set successfully" });
        setPasswords({ current: "", new: "", confirm: "" });
        setUserHasPassword(true);
      } else {
        setPassStatus({ type: "error", message: data.error || "Failed to update password" });
      }
    } catch {
      setPassStatus({ type: "error", message: "An error occurred" });
    } finally {
      setPassLoading(false);
    }
  };

  const handleExportDatabase = async () => {
    setDbLoading(true);
    setDbStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings/database");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to export database");
      }
      const payload = await res.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `egs-proxy-ai-backup-${new Date().toISOString().replace(/[.:]/g, "-")}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setDbStatus({ type: "success", message: "Database backup downloaded" });
    } catch (err) {
      setDbStatus({ type: "error", message: err.message || "Failed to export database" });
    } finally {
      setDbLoading(false);
    }
  };

  const handleImportDatabase = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setDbLoading(true);
    setDbStatus({ type: "", message: "" });
    try {
      const payload = JSON.parse(await file.text());
      const res = await fetch("/api/settings/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to import database");
      setDbStatus({ type: "success", message: "Database imported successfully" });
    } catch (err) {
      setDbStatus({ type: "error", message: err.message || "Invalid backup file" });
    } finally {
      if (importFileRef.current) importFileRef.current.value = "";
      setDbLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col gap-6">

        {/* Local Mode */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-lg bg-green-500/10 text-green-500 flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">computer</span>
              </div>
              <div>
                <h2 className="text-xl font-semibold">Local Mode</h2>
                <p className="text-text-muted">Running on your machine</p>
              </div>
            </div>
            <div className="inline-flex p-1 rounded-lg bg-black/5 dark:bg-white/5">
              {["light", "dark", "system"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTheme(option)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all",
                    theme === option
                      ? "bg-white dark:bg-white/10 text-text-main shadow-sm"
                      : "text-text-muted hover:text-text-main"
                  )}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {option === "light" ? "light_mode" : option === "dark" ? "dark_mode" : "contrast"}
                  </span>
                  <span className="capitalize text-sm">{option}</span>
                </button>
              ))}
            </div>
          </div>
          {isAdmin && (
            <div className="flex flex-col gap-3 pt-4 border-t border-border">
              <div className="flex items-center justify-between p-3 rounded-lg bg-bg border border-border">
                <div>
                  <p className="font-medium">Database Location</p>
                  <p className="text-sm text-text-muted font-mono">~/.egs-proxy-ai/db.json</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon="download" onClick={handleExportDatabase} loading={dbLoading}>
                  Download Backup
                </Button>
                <Button variant="outline" icon="upload" onClick={() => importFileRef.current?.click()} disabled={dbLoading}>
                  Import Backup
                </Button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleImportDatabase}
                />
              </div>
              {dbStatus.message && (
                <p className={`text-sm ${dbStatus.type === "error" ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                  {dbStatus.message}
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Password */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[20px]">lock</span>
            </div>
            <h3 className="text-lg font-semibold">Password</h3>
          </div>

          {requireLogin ? (
            <form onSubmit={handlePasswordChange} className="flex flex-col gap-4">
              {userHasPassword === false && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    You don&apos;t have a password yet (e.g. signed in with Microsoft). Set one to sign in with email and password.
                  </p>
                </div>
              )}
              {userHasPassword === true && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Current Password</label>
                  <Input
                    type="password"
                    placeholder="Enter current password"
                    value={passwords.current}
                    onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                    required
                  />
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">New Password</label>
                  <Input
                    type="password"
                    placeholder="Enter new password"
                    value={passwords.new}
                    onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Confirm New Password</label>
                  <Input
                    type="password"
                    placeholder="Confirm new password"
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                    required
                  />
                </div>
              </div>
              {passStatus.message && (
                <p className={`text-sm ${passStatus.type === "error" ? "text-red-500" : "text-green-500"}`}>
                  {passStatus.message}
                </p>
              )}
              <div>
                <Button type="submit" variant="primary" loading={passLoading}>
                  {userHasPassword ? "Update Password" : "Set Password"}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-text-muted">
              Login is currently disabled. Enable <strong>Require Login</strong> in{" "}
              <a href="/dashboard/security" className="text-primary underline underline-offset-2">Security &amp; Routing</a>{" "}
              to manage your password.
            </p>
          )}
        </Card>

        {/* App Info */}
        <div className="text-center text-sm text-text-muted py-4">
          <p>{APP_CONFIG.name} v{APP_CONFIG.version}</p>
          <p className="mt-1">Local Mode - All data stored on your machine</p>
        </div>

      </div>
    </div>
  );
}
