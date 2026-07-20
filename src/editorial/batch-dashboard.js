export async function renderBatchDashboard(root, jobId) {
  root.innerHTML = '<main class="editorial-route"><h1>Batch transcription</h1><p>UNVERIFIED MACHINE TRANSCRIPTION — candidate output only.</p><pre id="batch-state">Loading…</pre></main>'
  const output = root.querySelector('#batch-state')
  if (!jobId) { output.textContent = 'No batch job selected. Use ?job=<job-id>.'; return }
  try { const response = await fetch(`/data/candidates/batches/${encodeURIComponent(jobId)}/job.json`); if (!response.ok) throw new Error(`job ${response.status}`); const job = await response.json(); output.textContent = JSON.stringify({ jobId: job.jobId, state: job.state, pages: job.pages, provider: job.provider, model: job.model, canonical: false, candidateOnly: true, reviewRequired: true }, null, 2) } catch (error) { output.textContent = `Batch status unavailable: ${error.message}` }
}

