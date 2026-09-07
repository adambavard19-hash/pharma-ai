"use client";

import { useState, useTransition } from "react";
import { changeOwnPasswordAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await changeOwnPasswordAction({ currentPassword, newPassword });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Mot de passe modifié" });
      setCurrentPassword("");
      setNewPassword("");
    });
  };

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label="Mot de passe actuel" htmlFor="current">
          <Input
            id="current"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </Field>

        <Field
          label="Nouveau mot de passe"
          htmlFor="next"
          hint="12 caractères minimum, avec majuscule et chiffre."
        >
          <Input
            id="next"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </Field>

        <Button
          onClick={submit}
          loading={pending}
          disabled={!currentPassword || !newPassword}
        >
          Modifier
        </Button>
      </CardContent>
    </Card>
  );
}
