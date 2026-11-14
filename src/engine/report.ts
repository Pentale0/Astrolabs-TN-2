import type { ProgressSummary, Summary } from '../shared/types.ts';

function wrapLine(text: string, maxLen = 86, indent = '  '): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = indent;
  for (const w of words) {
    if (current.length + w.length + 1 > maxLen && current.trim().length > 0) {
      lines.push(current);
      current = indent + w;
    } else {
      current += (current === indent ? '' : ' ') + w;
    }
  }
  if (current.trim().length > 0) {
    lines.push(current);
  }
  return lines;
}

function asciiSanitize(text: string): string {
  return text
    .replace(/—/g, '--')
    .replace(/–/g, '-')
    .replace(/°C/g, 'C')
    .replace(/±/g, '+/-');
}

export function formatMedicalReport(summary: Summary, progress: ProgressSummary): string {
  const lines: string[] = [];
  const hr = '='.repeat(76);
  const subHr = '-'.repeat(76);

  lines.push(hr);
  lines.push('VIGIL MISSION MEDICAL TELEMETRY REPORT');
  lines.push(hr);
  lines.push(`Crew Member : ${summary.crew.name} (${summary.crew.id}) - ${summary.crew.role}`);
  lines.push(`Environment : ${summary.environment.name} [${summary.environment.comm_delay_label}]`);
  lines.push(`Mission Day : Start ${summary.crew.mission_start_date} | Baseline Mass ${summary.crew.baseline_mass_kg.toFixed(1)} kg`);
  lines.push(`Generated   : ${summary.generated_at}`);
  lines.push(`Status      : ${summary.overall_status.toUpperCase()} -- ${asciiSanitize(summary.headline)}`);
  lines.push(`Summary     : ${asciiSanitize(summary.subline)}`);
  lines.push(`Readiness   : Level ${progress.level} (${progress.level_name}) | Streak ${progress.current_streak}d | ${progress.points} pts`);
  lines.push('');

  lines.push('ESCALATION & COMMUNICATIONS');
  lines.push(subHr);
  lines.push(`Required    : ${summary.escalation.required ? 'YES' : 'NO'} (${summary.escalation.level})`);
  lines.push(`Protocol    : ${summary.escalation.autonomous_protocol ? 'Autonomous Crew Protocol' : 'Ground Flight Surgeon Loop'}`);
  lines.push(...wrapLine(asciiSanitize(summary.escalation.note), 86, '  '));
  lines.push('');

  lines.push('ACTIVE INSIGHTS & COUNTERMEASURES');
  lines.push(subHr);
  if (summary.insights.length === 0) {
    lines.push('  No telemetry insights available. Log a baseline check-in.');
  } else {
    for (const ins of summary.insights) {
      lines.push(`  [${ins.severity.toUpperCase()}] ${asciiSanitize(ins.title)}`);
      lines.push(...wrapLine(asciiSanitize(ins.message), 86, '    '));
      for (const act of ins.actions) {
        lines.push(...wrapLine(`* ${asciiSanitize(act)}`, 86, '    '));
      }
    }
  }
  lines.push('');

  lines.push('BODY REGION STATUS & LATEST INDICATORS');
  lines.push(subHr);
  for (const reg of summary.regions) {
    lines.push(`  ${asciiSanitize(reg.name)} [${reg.status.toUpperCase()}]`);
    lines.push(...wrapLine(asciiSanitize(reg.headline), 86, '    '));
    for (const ind of reg.indicators) {
      const val = asciiSanitize(ind.display_value);
      const unit = asciiSanitize(ind.unit);
      const dueTag = ind.due ? ' (DUE)' : '';
      lines.push(`    - ${ind.name}: ${val} ${unit} [${ind.status.toUpperCase()}]${dueTag}`);
    }
    for (const sym of reg.active_symptoms) {
      lines.push(`    - Symptom: ${sym.name} (sev ${sym.severity}/3) [${sym.status.toUpperCase()}]`);
    }
  }

  lines.push(hr);
  lines.push('END OF TRANSMISSION');
  return lines.join('\n');
}
