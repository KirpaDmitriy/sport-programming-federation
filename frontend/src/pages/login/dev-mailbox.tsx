import { useMutation } from '@tanstack/react-query';
import { api, describeError, requireData } from '@/shared/api';
import { Button, Callout } from '@/shared/ui';

/** Development-only shortcut that reads the mock mailbox through /__mock__/email-codes. */
export default function DevMailbox({ challengeId, onCode }: { challengeId: string; onCode: (code: string) => void }) {
  const read = useMutation({
    mutationFn: async () => requireData(await api.GET('/__mock__/email-codes')),
    onSuccess: (result) => {
      const entry = result.items.find((item) => item.challengeId === challengeId);
      if (entry) onCode(entry.code);
    },
  });
  return (
    <Callout tone="warning" title="Локальная разработка">
      <Button size="sm" onClick={() => read.mutate()} pending={read.isPending}>
        Вставить код из демо-ящика
      </Button>
      {read.error && <p>{describeError(read.error).message}</p>}
    </Callout>
  );
}
