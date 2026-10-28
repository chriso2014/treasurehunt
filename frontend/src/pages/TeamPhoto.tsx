import { useEffect, useRef, useState } from 'react';
import { confirmPhoto, getPhotoUpload, uploadToS3 } from '../api/client.js';
import { Button, ErrorMessage, LinkButton, Screen } from '../components/ui.js';
import { errorText } from '../lib/errors.js';
import { resizeToJpeg } from '../lib/image.js';

type Props = { teamName: string; onDone: () => void; onCancel?: () => void };

export const TeamPhoto = ({ teamName, onDone, onCancel }: Props) => {
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<Blob>();
  const [preview, setPreview] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const resized = await resizeToJpeg(file);
      setPhoto(resized);
      setPreview(URL.createObjectURL(resized));
    } catch {
      setError('Could not read that photo. Try taking it again.');
    }
  };

  const upload = async () => {
    if (!photo) return;
    setBusy(true);
    setError('');
    try {
      const target = await getPhotoUpload();
      await uploadToS3(target, photo);
      await confirmPhoto(target.key);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Team photo">
      <p className="text-center text-lg text-slate-300">
        Take a selfie of the whole of <strong className="text-white">{teamName}</strong>.
      </p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        data-testid="photo-input"
        onChange={(e) => void choose(e.target.files?.[0])}
      />
      {preview && (
        <img src={preview} alt="Your team photo" className="w-full rounded-2xl object-cover" />
      )}
      <ErrorMessage>{error}</ErrorMessage>
      {photo ? (
        <>
          <Button onClick={() => void upload()} busy={busy}>
            Use this photo
          </Button>
          <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
            Retake
          </Button>
        </>
      ) : (
        <Button onClick={() => input.current?.click()}>Take photo</Button>
      )}
      {onCancel && <LinkButton onClick={onCancel}>Keep the current photo</LinkButton>}
    </Screen>
  );
};
