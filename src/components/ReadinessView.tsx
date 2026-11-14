import { useEffect, useState } from 'react';
import { Award, CheckCircle2, Lock } from 'lucide-react';
import { vigilApi } from '../api/client.ts';
import type { ProgressSummary } from '../shared/types.ts';

interface ReadinessViewProps {
  crewId: string;
  refreshKey: number;
}

export function ReadinessView({ crewId, refreshKey }: ReadinessViewProps) {
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    vigilApi
      .getProgress(crewId)
      .then((res) => {
        if (active) setProgress(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [crewId, refreshKey]);

  if (loading && !progress) {
    return (
      <div className="rounded-lg border border-slate-800 bg-[#0E1522] p-8 text-center text-sm text-slate-400">
        Loading crew readiness metrics...
      </div>
    );
  }

  if (!progress) return null;

  const earnedCount = progress.badges.filter((b) => b.earned).length;
  const pctToNext =
    progress.next_level_points && progress.points_to_next_level !== null
      ? Math.min(
          100,
          Math.round(
            ((progress.next_level_points - progress.points_to_next_level) /
              progress.next_level_points) *
              100
          )
        )
      : 100;

  return (
    <div className="space-y-6">
      {/* Top 4 KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-800 bg-[#0E1522] p-4">
          <p className="text-xs text-slate-400">Crew Rank</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">
            Level {progress.level}
          </p>
          <p className="mt-0.5 text-xs text-cyan-300">{progress.level_name}</p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E1522] p-4">
          <p className="text-xs text-slate-400">Telemetry Points</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-100">
            {progress.points}
            <span className="ml-1.5 text-xs font-normal text-slate-400">PTS</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {progress.points_to_next_level !== null
              ? `${progress.points_to_next_level} pts to next rank`
              : 'Maximum rank reached'}
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E1522] p-4">
          <p className="text-xs text-slate-400">Active UTC Streak</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-100">
            {progress.current_streak}
            <span className="ml-1.5 text-xs font-normal text-slate-400">DAYS</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Best streak: {progress.best_streak} days
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#0E1522] p-4">
          <p className="text-xs text-slate-400">Check-In Discipline</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-100">
            {progress.total_checkins}
            <span className="ml-1.5 text-xs font-normal text-slate-400">LOGS</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {earnedCount} / {progress.badges.length} badges earned
          </p>
        </div>
      </div>

      {/* Level Progress Bar */}
      <div className="rounded-lg border border-slate-800 bg-[#0E1522] p-5 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-200">
            Rank Progression · {progress.level_name}
          </span>
          <span className="font-mono text-slate-400">{pctToNext}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-cyan-500 transition-all"
            style={{ width: `${pctToNext}%` }}
          />
        </div>
      </div>

      {/* All 7 Mission Badges */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">
            Mission Health Badges
          </h2>
          <span className="font-mono text-xs text-slate-400">
            {earnedCount} of {progress.badges.length} unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {progress.badges.map((badge) => (
            <div
              key={badge.badge_id}
              className={`rounded-lg border p-4 space-y-2 ${
                badge.badge_id === 'symptom_clear' ? 'lg:col-span-2' : ''
              } ${
                badge.earned
                  ? 'border-cyan-500/40 bg-[#0E1522]'
                  : 'border-slate-800 bg-[#0A0F1A] opacity-75'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {badge.earned ? (
                    <Award className="h-4 w-4 text-cyan-400 shrink-0" />
                  ) : (
                    <Lock className="h-4 w-4 text-slate-500 shrink-0" />
                  )}
                  <h3 className="text-sm font-semibold text-slate-100">{badge.name}</h3>
                </div>
                <span className="font-mono text-xs text-slate-400">
                  +{badge.points}
                </span>
              </div>

              <p className="text-xs text-slate-400">{badge.description}</p>

              <div className="flex items-center gap-1.5 pt-1 font-mono text-xs">
                {badge.earned ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-300">
                      Earned {badge.earned_at?.slice(0, 10)}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-500">Locked</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
