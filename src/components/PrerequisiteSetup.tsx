import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import {
  canDownloadInstaller,
  canOpenOfficialInstaller,
  createSetupItems,
  isExpectedSha256,
  SETUP_ITEMS,
  type SetupDefinition,
  type SetupItemId,
} from '../lib/prerequisiteSetup'
import type { PrerequisiteProgress } from '../../electron/preload'
import BrandLogo from './BrandLogo'
import { APP_NAME } from '../lib/brand'

type ItemProgress = PrerequisiteProgress & { message?: string }

/** Optional first-run checklist. Skipping never blocks chat, files, or local work. */
export default function PrerequisiteSetup() {
  const settings = useStore((state) => state.settings)
  const setSettings = useStore((state) => state.setSettings)
  const setActivePanel = useStore((state) => state.setActivePanel)
  const requestAdvancedSettings = useStore((state) => state.requestAdvancedSettings)
  const [definitions, setDefinitions] = useState<SetupDefinition[]>(SETUP_ITEMS)
  const [consent, setConsent] = useState<Partial<Record<SetupItemId, boolean>>>({})
  const [completed, setCompleted] = useState<Partial<Record<SetupItemId, boolean>>>({})
  const [expectedHashes, setExpectedHashes] = useState<Partial<Record<SetupItemId, string>>>({})
  const [progress, setProgress] = useState<Partial<Record<SetupItemId, ItemProgress>>>({})
  const [busyId, setBusyId] = useState<SetupItemId | null>(null)
  const [skipError, setSkipError] = useState('')
  const items = useMemo(() => createSetupItems(consent, completed, definitions), [completed, consent, definitions])

  useEffect(() => {
    let active = true
    void window.api.listPrerequisites().then((catalog) => {
      if (active && Array.isArray(catalog) && catalog.length) setDefinitions(catalog)
    }).catch(() => {
      // The local catalog is still safe and explains unavailable artifacts.
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const cleanup = window.api.onPrerequisiteProgress((next) => {
      setProgress((current) => ({ ...current, [next.id]: next }))
      if (next.state === 'ready' || next.state === 'failed' || next.state === 'cancelled') {
        setBusyId((current) => current === next.id ? null : current)
      }
      if (next.state === 'ready') setCompleted((current) => ({ ...current, [next.id]: true }))
    })
    return typeof cleanup === 'function' ? cleanup : undefined
  }, [])

  if (settings.setupChecklistDismissed || !settings.providers.length) return null

  const skip = async (customize = false) => {
    const next = { ...settings, setupChecklistDismissed: true }
    const saved = await window.api.saveSettings(next)
    if ('error' in saved) {
      setSkipError(saved.error)
      return
    }
    setSettings(next)
    if (customize) {
      requestAdvancedSettings(true)
      setActivePanel('settings')
    }
  }

  const openOfficial = async (id: SetupItemId) => {
    const item = items.find((candidate) => candidate.id === id)
    if (!item || !consent[id] || !canOpenOfficialInstaller(item)) return
    try {
      const result = await window.api.openOfficialPrerequisite({ id, consent: true })
      if (!result.success) setProgress((current) => ({ ...current, [id]: { id, state: 'failed', bytesReceived: 0, message: result.error || 'Official source unavailable.' } }))
    } catch (error) {
      setProgress((current) => ({ ...current, [id]: { id, state: 'failed', bytesReceived: 0, message: error instanceof Error ? error.message : 'Official source unavailable.' } }))
    }
  }

  const downloadAndLaunch = async (id: SetupItemId) => {
    const item = items.find((candidate) => candidate.id === id)
    const expectedSha256 = expectedHashes[id]?.trim() || ''
    if (!item || !consent[id] || !canDownloadInstaller(item, expectedSha256)) return
    setBusyId(id)
    try {
      const result = await window.api.downloadPrerequisite({ id, consent: true, expectedSha256 })
      if (!result.success) {
        setBusyId(null)
        setProgress((current) => ({ ...current, [id]: { id, state: result.cancelled ? 'cancelled' : 'failed', bytesReceived: 0, message: result.error } }))
      }
    } catch (error) {
      setBusyId(null)
      setProgress((current) => ({ ...current, [id]: { id, state: 'failed', bytesReceived: 0, message: error instanceof Error ? error.message : 'Prerequisite download failed.' } }))
    }
  }

  const hashHint = (id: SetupItemId) => {
    const value = expectedHashes[id] || ''
    if (!value) return 'Unavailable until a 64-character expected SHA-256 from the official signed release manifest is provided.'
    return isExpectedSha256(value) ? 'Hash accepted. It will be checked in the main process.' : 'Enter exactly 64 hexadecimal characters.'
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="setup-title" style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(0,0,0,.72)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <section style={{ maxWidth: 760, width: '100%', maxHeight: '90vh', overflow: 'auto', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, boxShadow: '0 20px 80px rgba(0,0,0,.45)' }}>
        <BrandLogo className="vd-setup-logo" />
        <h2 id="setup-title" style={{ marginTop: 0 }}>Customize {APP_NAME}</h2>
        <p>Skip to use defaults. Model and provider controls, autocomplete, OCR, indexing, update channel and telemetry are in Settings &gt; Advanced. Optional installations below are independent and require explicit consent. Downloads use only the fixed official HTTPS source selected by {APP_NAME}, are kept in the existing app data folder, and are verified before the operating system opens them.</p>
        {items.map((item) => {
          const itemProgress = progress[item.id]
          const expectedSha256 = expectedHashes[item.id] || ''
          const canDownload = Boolean(consent[item.id]) && canDownloadInstaller(item, expectedSha256)
          const isBusy = busyId === item.id
          return (
            <div key={item.id} style={{ borderTop: '1px solid var(--border)', padding: '16px 0' }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={consent[item.id] === true} onChange={(event) => setConsent((current) => ({ ...current, [item.id]: event.target.checked }))} aria-label={`Consent to set up ${item.title}`} />
                <span><strong>{item.title}</strong><br /><span className="muted">{item.detail}</span></span>
              </label>
              <div className="muted" style={{ margin: '8px 0 8px 26px' }}>Download: {item.size} · Disk: {item.disk}</div>
              <div style={{ marginLeft: 26, display: 'grid', gap: 6 }}>
                <label className="muted" htmlFor={`hash-${item.id}`}>Expected SHA-256 (required)</label>
                <input
                  id={`hash-${item.id}`}
                  aria-label={`Expected SHA-256 for ${item.title}`}
                  value={expectedSha256}
                  onChange={(event) => setExpectedHashes((current) => ({ ...current, [item.id]: event.target.value }))}
                  placeholder="64 hexadecimal characters from the official release manifest"
                  spellCheck={false}
                  autoComplete="off"
                  disabled={isBusy}
                />
                <span className="muted">{item.unavailableReason || hashHint(item.id)}</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" disabled={!consent[item.id] || isBusy} onClick={() => void openOfficial(item.id)}>Open official source</button>
                  <button type="button" disabled={!canDownload || isBusy} onClick={() => void downloadAndLaunch(item.id)}>{isBusy ? 'Downloading…' : 'Download, verify & launch'}</button>
                  {isBusy && <button type="button" onClick={() => void window.api.cancelPrerequisite(item.id)}>Cancel</button>}
                </div>
                {itemProgress && <div role="status" aria-label={`${item.title} setup status`} className="muted">
                  {itemProgress.state === 'downloading' && `Downloading${itemProgress.percent === undefined ? '' : `: ${Math.round(itemProgress.percent)}%`}`}
                  {itemProgress.state === 'verifying' && 'Verifying SHA-256…'}
                  {itemProgress.state === 'launching' && 'Verified; launching official installer…'}
                  {itemProgress.state === 'ready' && 'Verified installer launched.'}
                  {(itemProgress.state === 'failed' || itemProgress.state === 'cancelled') && itemProgress.message}
                </div>}
              </div>
            </div>
          )
        })}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={() => void skip()}>Skip use defaults</button>
          <button type="button" onClick={() => void skip(true)}>Customize settings and models</button>
          <button type="button" onClick={() => void skip()}>Continue to {APP_NAME}</button>
        </div>
        {skipError && <div role="alert">{skipError}</div>}
        <p className="muted" style={{ marginBottom: 0 }}>No arbitrary URL, silent elevation, workspace output, or unverified launch is allowed. Any OS permission prompt comes from the official installer after it opens.</p>
      </section>
    </div>
  )
}
