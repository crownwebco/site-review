import type { ReviewSubmissionData } from './types';

/**
 * Generates an HTML email body from review submission data.
 * Import this in your server action — it has no client-side dependencies.
 */
export function formatReviewEmail(
  data: ReviewSubmissionData[],
  siteName = 'Website Review'
): string {
  const byPage = data.reduce(
    (acc, s) => {
      if (!acc[s.page]) acc[s.page] = [];
      acc[s.page].push(s);
      return acc;
    },
    {} as Record<string, ReviewSubmissionData[]>
  );

  const pageBlocks = Object.entries(byPage)
    .map(([page, pageSections]) => {
      const reviewed = pageSections.filter((s) => s.status !== 'unreviewed').length;
      const rows = pageSections
        .map((s) => {
          const color =
            s.status === 'approved'
              ? '#16a34a'
              : s.status === 'commented'
                ? '#d97706'
                : '#9ca3af';
          const label =
            s.status === 'approved'
              ? '✓ Approved'
              : s.status === 'commented'
                ? '✏ Has Feedback'
                : '○ Not Reviewed';
          const commentCell =
            s.comment?.trim()
              ? `<em style="color:#64748b;">"${s.comment.trim()}"</em>`
              : '<span style="color:#cbd5e1;">—</span>';
          return `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#475569;">${s.name}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:${color};font-weight:600;">${label}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;">${commentCell}</td>
          </tr>`;
        })
        .join('');

      return `
      <div style="margin-bottom:28px;">
        <h3 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 8px;padding-bottom:8px;border-bottom:2px solid #e2e8f0;">
          ${page}
          <span style="font-size:12px;font-weight:400;color:#94a3b8;margin-left:8px;">(${reviewed}/${pageSections.length} reviewed)</span>
        </h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;width:30%;">Section</th>
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;width:25%;">Status</th>
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Feedback</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    })
    .join('');

  const total = data.length;
  const reviewed = data.filter((s) => s.status !== 'unreviewed').length;
  const approved = data.filter((s) => s.status === 'approved').length;
  const commented = data.filter((s) => s.status === 'commented').length;
  const deviceType = data[0]?.deviceType;
  const submittedAt = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${siteName} — Review</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;line-height:1.6;max-width:700px;margin:0 auto;padding:24px;">

  <div style="background:linear-gradient(135deg,#0ea5e9,#8b5cf6);padding:28px;border-radius:12px;margin-bottom:24px;text-align:center;">
    <h1 style="color:white;font-size:24px;margin:0 0 6px;font-weight:800;">Website Review Complete</h1>
    <p style="color:rgba(255,255,255,.9);margin:0;font-size:15px;">${siteName}</p>
    ${deviceType ? `<span style="display:inline-block;margin-top:12px;background:rgba(255,255,255,.2);color:white;font-size:12px;font-weight:600;padding:4px 14px;border-radius:20px;border:1px solid rgba(255,255,255,.35);">Reviewed on ${deviceType}</span>` : ''}
  </div>

  <div style="display:flex;gap:12px;margin-bottom:28px;">
    <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:#16a34a;">${approved}</div>
      <div style="font-size:12px;color:#15803d;font-weight:600;margin-top:2px;">Approved</div>
    </div>
    <div style="flex:1;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:#d97706;">${commented}</div>
      <div style="font-size:12px;color:#b45309;font-weight:600;margin-top:2px;">With Feedback</div>
    </div>
    <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:#0f172a;">${reviewed}/${total}</div>
      <div style="font-size:12px;color:#64748b;font-weight:600;margin-top:2px;">Total Reviewed</div>
    </div>
  </div>

  <h2 style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 20px;">Review by Page</h2>

  ${pageBlocks}

  <div style="margin-top:24px;padding:14px;background:#f8fafc;border-radius:8px;font-size:12px;color:#94a3b8;text-align:center;">
    Review submitted on ${submittedAt}
  </div>
</body>
</html>`;
}
