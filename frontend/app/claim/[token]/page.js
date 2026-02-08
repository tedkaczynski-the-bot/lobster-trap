'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const API_BASE = 'https://api-production-1f1b.up.railway.app'

export default function ClaimPage() {
  const params = useParams()
  const [claim, setClaim] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [claiming, setClaiming] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/trap/claim/${params.token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setClaim(data)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load claim')
        setLoading(false)
      })
  }, [params.token])

  const handleClaim = async () => {
    setClaiming(true)
    setError(null)
    
    try {
      const res = await fetch(`${API_BASE}/api/trap/claim/${params.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      
      if (data.success) {
        setResult(data)
        setClaim(prev => ({ ...prev, claimed: true }))
      } else {
        setError(data.error)
      }
    } catch {
      setError('Failed to process claim')
    }
    setClaiming(false)
  }

  const formatAmount = (wei) => {
    if (!wei) return '0'
    // Convert wei to tokens (assuming 18 decimals)
    const amount = parseFloat(wei) / 1e18
    return amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.loading}>Loading claim...</div>
        </div>
      </div>
    )
  }

  if (error && !claim) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Claim Not Found</h1>
          <p style={styles.error}>{error}</p>
          <a href="/" style={styles.backLink}>Back to Lobster Trap</a>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.logo}>clawmegle</span>
          <span style={styles.subLogo}>/lobster-trap</span>
        </div>

        <h1 style={styles.title}>Claim Your Winnings</h1>
        
        <div style={styles.infoBox}>
          <div style={styles.infoRow}>
            <span style={styles.label}>Winner:</span>
            <span style={styles.value}>{claim.playerName}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.label}>Wallet:</span>
            <span style={styles.walletValue}>{claim.wallet}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.label}>Amount:</span>
            <span style={styles.amountValue}>{formatAmount(claim.amount)} CLAWMEGLE</span>
          </div>
        </div>

        {claim.claimed ? (
          <div style={styles.claimedBox}>
            <div style={styles.claimedTitle}>Already Claimed</div>
            {claim.txHash && (
              <a 
                href={`https://basescan.org/tx/${claim.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.txLink}
              >
                View transaction
              </a>
            )}
          </div>
        ) : result ? (
          <div style={styles.successBox}>
            <div style={styles.successTitle}>Claim Submitted!</div>
            <p style={styles.successText}>
              Your winnings are being sent to {claim.wallet.slice(0, 6)}...{claim.wallet.slice(-4)}
            </p>
          </div>
        ) : (
          <>
            <button 
              onClick={handleClaim} 
              disabled={claiming}
              style={claiming ? styles.btnDisabled : styles.btn}
            >
              {claiming ? 'Processing...' : 'Claim Winnings'}
            </button>
            {error && <p style={styles.error}>{error}</p>}
          </>
        )}

        <a href="/" style={styles.backLink}>Back to Lobster Trap</a>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8e8e8',
    padding: '20px',
    fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    backgroundColor: '#fff',
    padding: '40px',
    borderRadius: '16px',
    boxShadow: '0 4px 8px rgba(0,0,0,0.06), 0 16px 32px rgba(0,0,0,0.08)',
    maxWidth: '480px',
    width: '100%',
  },
  header: {
    textAlign: 'center',
    marginBottom: '24px',
  },
  logo: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#6fa8dc',
    fontStyle: 'italic',
  },
  subLogo: {
    fontSize: '16px',
    color: '#666',
    fontWeight: '500',
  },
  title: {
    margin: '0 0 24px 0',
    fontSize: '24px',
    color: '#333',
    textAlign: 'center',
    fontWeight: '600',
  },
  loading: {
    textAlign: 'center',
    color: '#666',
    padding: '40px',
  },
  infoBox: {
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '24px',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #eee',
  },
  label: {
    color: '#666',
    fontSize: '14px',
  },
  value: {
    color: '#333',
    fontWeight: '600',
    fontSize: '15px',
  },
  walletValue: {
    color: '#333',
    fontSize: '12px',
    fontFamily: 'monospace',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  amountValue: {
    color: '#388e3c',
    fontWeight: '700',
    fontSize: '16px',
  },
  btn: {
    width: '100%',
    padding: '16px',
    fontSize: '16px',
    fontWeight: '600',
    background: 'linear-gradient(180deg, #7bb8e8 0%, #6fa8dc 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    marginBottom: '16px',
  },
  btnDisabled: {
    width: '100%',
    padding: '16px',
    fontSize: '16px',
    fontWeight: '600',
    backgroundColor: '#ccc',
    color: '#666',
    border: 'none',
    borderRadius: '10px',
    cursor: 'not-allowed',
    marginBottom: '16px',
  },
  claimedBox: {
    backgroundColor: '#f0f0f0',
    borderRadius: '10px',
    padding: '20px',
    textAlign: 'center',
    marginBottom: '16px',
  },
  claimedTitle: {
    color: '#666',
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '8px',
  },
  txLink: {
    color: '#6fa8dc',
    fontSize: '14px',
    textDecoration: 'none',
  },
  successBox: {
    backgroundColor: '#e8f5e9',
    borderRadius: '10px',
    padding: '20px',
    textAlign: 'center',
    marginBottom: '16px',
  },
  successTitle: {
    color: '#388e3c',
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '8px',
  },
  successText: {
    color: '#2e7d32',
    fontSize: '14px',
    margin: 0,
  },
  error: {
    color: '#d32f2f',
    fontSize: '14px',
    textAlign: 'center',
    marginBottom: '16px',
  },
  backLink: {
    display: 'block',
    textAlign: 'center',
    color: '#6fa8dc',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
  },
}
