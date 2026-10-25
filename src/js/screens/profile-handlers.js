// Pure save handlers for the profile screen.
//
// Handle the save-button submit and the avatar-picker tap independently.
// Both call commands.updateProfile and, on success, invoke saveUser with
// the merged shape so the local cache stays in step with the API.

import { text } from '../copy.js';
import { errorText } from '../errors.js';

export async function handleProfileSave({
  name,
  vibeMessage,
  commands,
  saveUser,
  showToast,
  onSuccess,
  onValidationError,
}) {
  const trimmedName = (name ?? '').trim();
  if (!trimmedName) {
    onValidationError('name');
    return;
  }

  const fields = { name: trimmedName, vibeMessage: (vibeMessage ?? '').trim() };

  try {
    const result = await commands.updateProfile(fields);
    saveUser(result);
    showToast(text('profile.saved'));
    onSuccess();
  } catch (err) {
    showToast(errorText(err, 'profile.saveFailed'));
  }
}

export async function handleAvatarChange({ avatar, commands, saveUser, showToast }) {
  try {
    const result = await commands.updateProfile({ avatar });
    saveUser(result);
    showToast(text('profile.avatarSaved'));
  } catch (err) {
    showToast(errorText(err, 'profile.avatarFailed'));
  }
}

export async function handleDataExport({ commands, triggerDownload, showToast }) {
  try {
    const data = await commands.exportData();
    triggerDownload(data);
    showToast(text('profile.export.started'));
  } catch (err) {
    showToast(errorText(err, 'profile.export.failed'));
  }
}

// Account deletion. Caller passes `confirmed: true` only after the user
// has explicitly affirmed the destructive action in the UI. On success
// we sign out (the auth token is now backed by a deleted Cognito user)
// and let the caller route to wherever makes sense from there.
export async function handleAccountDelete({
  confirmed,
  commands,
  signOut,
  showToast,
  onDeleted,
}) {
  if (!confirmed) return;
  try {
    await commands.deleteAccount();
    signOut();
    onDeleted();
  } catch (err) {
    showToast(errorText(err, 'profile.delete.failed'));
  }
}
