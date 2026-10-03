"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { saveProfile, type ProfileState } from "@/lib/supabase/profile-actions";
import type { Profile } from "@/types/database";

import styles from "./ProfileForm.module.css";

function SubmitButton({ isEditing }: { isEditing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.submit} disabled={pending}>
      {pending ? "Saving…" : isEditing ? "Save changes" : "Create profile"}
    </button>
  );
}

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const [state, formAction] = useActionState<ProfileState, FormData>(
    saveProfile,
    {},
  );

  return (
    <form action={formAction} className={styles.form}>
      <label className={styles.field}>
        <span>
          Name <em className={styles.required}>required</em>
        </span>
        <input
          name="name"
          defaultValue={profile?.name ?? ""}
          required
          maxLength={120}
          placeholder="Your full name"
        />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span>College</span>
          <input
            name="college"
            defaultValue={profile?.college ?? ""}
            maxLength={160}
            placeholder="e.g. COEP"
          />
        </label>

        <label className={styles.field}>
          <span>Branch</span>
          <input
            name="branch"
            defaultValue={profile?.branch ?? ""}
            maxLength={120}
            placeholder="e.g. Computer Engineering"
          />
        </label>
      </div>

      <label className={styles.field}>
        <span>Year</span>
        {/* Text, not number: the `year` column is text in this schema, so
            values like "2nd" or "Final" are valid. */}
        <input
          name="year"
          defaultValue={profile?.year ?? ""}
          maxLength={40}
          placeholder="e.g. 2"
          className={styles.narrow}
        />
      </label>

      <label className={styles.field}>
        <span>
          Interests <em className={styles.hint}>comma separated</em>
        </span>
        <input
          name="interests"
          defaultValue={(profile?.interests ?? []).join(", ")}
          placeholder="machine learning, design, startups"
        />
      </label>

      <label className={styles.field}>
        <span>
          Skills <em className={styles.hint}>comma separated</em>
        </span>
        <input
          name="skills"
          defaultValue={(profile?.skills ?? []).join(", ")}
          placeholder="python, react, figma"
        />
      </label>

      <label className={styles.field}>
        <span>Bio</span>
        <textarea
          name="bio"
          rows={4}
          maxLength={2000}
          defaultValue={profile?.bio ?? ""}
          placeholder="A couple of lines about you."
        />
      </label>

      <label className={styles.field}>
        <span>
          Photo{" "}
          <em className={styles.hint}>
            JPEG, PNG, WebP or GIF · up to 5 MB
            {profile?.photo_url ? " · leave empty to keep the current one" : ""}
          </em>
        </span>
        <input
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
        />
      </label>

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      {/* A bare auto-created row has no name yet, so it reads as "create". */}
      <SubmitButton isEditing={Boolean(profile?.name?.trim())} />
    </form>
  );
}
