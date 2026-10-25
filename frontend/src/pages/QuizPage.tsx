import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/ui/Toast';
import { messageOf } from '../core/AppError';
import type { QuizState } from '../core/types';
import { formatCountdown, msUntilAmsterdamMidnight } from '../features/wordle/clock';

/** De dagelijkse quizvraag: één poging per dag, 10 punten voor een goed antwoord. */
export function QuizPage() {
  const { social } = useServices();
  const toast = useToast();
  const [state, setState] = useState<QuizState | null>(null);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(msUntilAmsterdamMidnight());

  const load = useCallback(() => {
    social.quizToday().then(setState).catch(error => toast.error(messageOf(error)));
  }, [social, toast]);
  useEffect(load, [load]);
  useEffect(() => {
    const timer = setInterval(() => setRemaining(msUntilAmsterdamMidnight()), 1000);
    return () => clearInterval(timer);
  }, []);

  const answer = async (choice: number) => {
    setBusy(true);
    try {
      setState(await social.answerQuiz(choice));
    } catch (error) {
      toast.error(messageOf(error));
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Daily quiz" />
      <div className="page">
        {!state && <p className="muted">Loading…</p>}
        {state && !state.available && <div className="empty-state"><b>No question today.</b><span>Come back tomorrow.</span></div>}
        {state?.available && (
          <section className="card quiz">
            <p className="quiz-category">{state.category ?? 'Quiz'}</p>
            <h2>{state.question}</h2>
            <ul>
              {state.options?.map((option, index) => {
                const chosen = state.answered && state.chosen === index;
                const right = state.answered && state.correct_index === index;
                const className = state.answered ? (right ? 'right' : chosen ? 'wrong' : '') : '';
                return (
                  <li key={index}>
                    <button className={`quiz-option ${className}`} disabled={state.answered || busy} onClick={() => void answer(index)}>
                      <span className="quiz-letter">{String.fromCharCode(65 + index)}</span>{option}
                      {right && <i aria-label="Correct answer">✓</i>}
                    </button>
                  </li>
                );
              })}
            </ul>
            {state.answered && (
              <p className={`quiz-result ${state.correct ? 'ok' : 'miss'}`} role="status">
                {state.correct ? `Correct! You earned ${state.points} points.` : 'Not this time, but the right answer is marked.'}
                <small> Next question in {formatCountdown(remaining)}.</small>
              </p>
            )}
          </section>
        )}
      </div>
    </>
  );
}
