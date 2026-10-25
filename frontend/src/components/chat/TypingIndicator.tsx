import { describeTyping } from '../../core/typing';

/** Regel boven het invoerveld met de namen van wie er typt; de ruimte blijft gereserveerd zodat er niets verspringt. */
export function TypingIndicator({ names }: { names: string[] }) {
  const text = describeTyping(names);
  return (
    <div className="typing" role="status" aria-live="polite">
      {text && (
        <>
          <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
          <span>{text}</span>
        </>
      )}
    </div>
  );
}
