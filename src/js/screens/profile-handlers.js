// Pure save handlers for the profile screen.
//
// Handle the save-button submit and the avatar-picker tap independently.
// Both call commands.updateProfile and, on success, invoke saveUser with
// the merged shape so the local cache stays in step with the API.

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
    showToast('Profile updated ✓');
    onSuccess();
  } catch (err) {
    showToast(err.message || 'Could not save your profile.');
  }
}

export async function handleAvatarChange({ avatar, commands, saveUser, showToast }) {
  try {
    const result = await commands.updateProfile({ avatar });
    saveUser(result);
    showToast('Avatar updated!');
  } catch (err) {
    showToast(err.message || 'Could not update avatar.');
  }
}

export async function handleDataExport({ commands, triggerDownload, showToast }) {
  try {
    const data = await commands.exportData();
    triggerDownload(data);
    showToast('Your data is downloading.');
  } catch (err) {
    showToast(err.message || 'Could not export your data.');
  }
}
