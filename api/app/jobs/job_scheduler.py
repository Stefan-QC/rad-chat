"""Plant de onderhoudstaken met APScheduler."""

import logging
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.errors import ApiError
from app.jobs.job_runner import JobName, JobRunner

logger = logging.getLogger("app.jobs")
DAILY_JOBS: tuple[JobName, ...] = ("expire_guests", "post_celebrations", "purge_messages")


class JobScheduler:
    """Draait dagelijks en wekelijks taken; fouten worden gelogd en laten de app niet crashen."""

    def __init__(self, runner: JobRunner, timezone: str, scheduler: AsyncIOScheduler | None = None) -> None:
        self._runner = runner
        self._timezone = ZoneInfo(timezone)
        self._scheduler = scheduler or AsyncIOScheduler(timezone=self._timezone)

    def configure(self) -> None:
        """Registreert de dagelijkse en wekelijkse taak."""
        self._scheduler.add_job(
            self.run_daily,
            CronTrigger(hour=7, minute=0, timezone=self._timezone),
            id="daily",
            replace_existing=True,
        )
        self._scheduler.add_job(
            self.run_weekly,
            CronTrigger(day_of_week="mon", hour=9, minute=0, timezone=self._timezone),
            id="weekly",
            replace_existing=True,
        )

    def job_ids(self) -> list[str]:
        """Geeft de ids van de geplande taken."""
        return sorted(job.id for job in self._scheduler.get_jobs())

    def start(self) -> None:
        """Configureert en start de scheduler."""
        self.configure()
        self._scheduler.start()

    def shutdown(self) -> None:
        """Stopt de scheduler zonder te wachten op lopende taken."""
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    async def run_daily(self) -> None:
        """Voert de dagelijkse taken één voor één uit."""
        for name in DAILY_JOBS:
            await self._run_safely(name)

    async def run_weekly(self) -> None:
        """Voert de wekelijkse koffieronde uit."""
        await self._run_safely("run_coffee_round")

    async def _run_safely(self, name: JobName) -> None:
        """Voert een taak uit en logt een fout zonder geheimen."""
        try:
            await self._runner.run(name, None, "scheduler")
        except ApiError as exc:
            logger.error("Scheduled job %s failed with status %s", name, exc.status_code)
        except Exception as exc:  # noqa: BLE001 - de scheduler mag nooit crashen
            logger.error("Scheduled job %s failed with %s", name, type(exc).__name__)
