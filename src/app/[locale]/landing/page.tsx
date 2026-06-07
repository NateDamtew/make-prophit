'use client'

import { useState, useEffect } from 'react'
import styles from './landing.module.css'

export default function LandingPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [country, setCountry] = useState('')
  const [step, setStep] = useState(1)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [waitlistCount, setWaitlistCount] = useState(0)

  useEffect(() => {
    let start = 0;
    const end = 1247;
    const duration = 2000;
    const increment = end / (duration / 16);
    
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setWaitlistCount(end);
        clearInterval(timer);
      } else {
        setWaitlistCount(Math.floor(start));
      }
    }, 16);
    
    return () => clearInterval(timer);
  }, [])

  const handleNextStep = () => {
    if (!name.trim() || !email || !email.includes('@')) {
      return
    }
    setStep(2)
  }

  const handleSubmit = async () => {
    setStatus('loading')

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, country }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong')
      }

      setStatus('success')
    } catch (err: any) {
      setStatus('error')
    }
  }

  return (
    <div className={styles.landingWrapper}>
      <div className={styles.tk}>
        <div className={styles.tkInner}>
          {Array(8).fill(null).map((_, i) => (
            <span key={i} className={styles.tkItem}>
              Help shape the future of Prophit.{' '}
              <a href="https://t.me/prophit" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--y)', textDecoration: 'underline' }}>
                Join our Telegram Community Today
              </a>
            </span>
          ))}
        </div>
      </div>

      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.heroTagline}>A Prediction Market for the Next Billions.</div>
          <div className={styles.heroMark} style={{ border: 'none' }}>
            <img src="/Prophit-Black.png" alt="Prophit" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        </div>
        <div className={styles.heroWaitlist}>
          <span className={styles.hwDot}></span>
          Join <strong>{waitlistCount.toLocaleString()}</strong> on the waitlist. 
          <span 
            onClick={() => document.querySelector('.' + styles.signup)?.scrollIntoView({ behavior: 'smooth' })}
            style={{ textDecoration: 'underline', cursor: 'pointer', fontWeight: 700, marginLeft: '4px' }}
          >
            Join Now &rarr;
          </span>
        </div>
        <div className={styles.heroBigmark}>Pro<em>ph</em>it</div>
      </section>

      <section className={styles.intro}>
        <div className={styles.introLabel}>What we&apos;re building &rarr;</div>
        <div className={styles.introBody}>Prophit is a decentralized prediction market built for Africa. On-chain. Smart-contract-settled. Same primitive as today&apos;s leading prediction markets &mdash; with one extra layer: communities.</div>
      </section>

      <div className={styles.marquee}>
        <div className={styles.marqueeInner}>
          <span className={styles.marqueeItem}>PREDICT <span className={styles.marqueeStar}>&#x2726;</span></span>
          <span className={styles.marqueeItem}><em>WIN</em> <span className={styles.marqueeStar}>&#x2726;</span></span>
          <span className={styles.marqueeItem}>OWN IT <span className={styles.marqueeStar}>&#x2726;</span></span>
          <span className={styles.marqueeItem}>PREDICT <span className={styles.marqueeStar}>&#x2726;</span></span>
          <span className={styles.marqueeItem}><em>WIN</em> <span className={styles.marqueeStar}>&#x2726;</span></span>
          <span className={styles.marqueeItem}>OWN IT <span className={styles.marqueeStar}>&#x2726;</span></span>
          <span className={styles.marqueeItem}>PREDICT <span className={styles.marqueeStar}>&#x2726;</span></span>
          <span className={styles.marqueeItem}><em>WIN</em> <span className={styles.marqueeStar}>&#x2726;</span></span>
          <span className={styles.marqueeItem}>OWN IT <span className={styles.marqueeStar}>&#x2726;</span></span>
        </div>
      </div>

      <section className={styles.duo}>
        <div className={`${styles.cell} ${styles.bgOrange}`}>
          <div className={styles.cellLabel}>01 / Markets, not bets.</div>
          <div>
            <div className={styles.cellHeadline}>Every market is a question with priced outcomes.</div>
            <div className={styles.cellBody}>Buy any outcome &mdash; YES/NO, UP/DOWN, or one of many. Prices reflect probability. Shares add up to $1.00, and winners pay out at $1.00 each.</div>
          </div>
        </div>
        <div className={`${styles.cell} ${styles.bgGray}`}>
          <div className={styles.cellLabel}>All outcomes sum to $1.00</div>
          <div className={styles.cellNum}>1<em>.00</em></div>
        </div>
      </section>

      <section className={styles.duo}>
        <div className={`${styles.cell} ${styles.bgCream}`}>
          <div className={styles.cellLabel}>50% to creators</div>
          <div className={styles.cellNum}>50<em>%</em></div>
        </div>
        <div className={`${styles.cell} ${styles.bgY}`}>
          <div className={styles.cellLabel}>02 / Build a market. Earn from it.</div>
          <div>
            <div className={styles.cellHeadline}>Create a market. Keep half the fees.</div>
            <div className={styles.cellBody}>Start a community around your team, your city, your niche. Every trade earns you a cut. The better your markets, the more you make.</div>
          </div>
        </div>
      </section>

      <section className={styles.duo}>
        <div className={`${styles.cell} ${styles.bgBlue}`}>
          <div className={styles.cellLabel}>03 / Settled by your community.</div>
          <div>
            <div className={styles.cellHeadline}>No central oracle. No black box.</div>
            <div className={styles.cellBody}>Markets are resolved by elected community juries &mdash; the people who actually know who won. Public reasoning, transparent settlement.</div>
          </div>
        </div>
        <div className={`${styles.cell} ${styles.bgBlack}`}>
          <div className={styles.cellLabel} style={{color: 'var(--y)'}}>Community jury</div>
          <div className={styles.cellNum} style={{color: 'var(--y)'}}>1<em>&ndash;10</em></div>
        </div>
      </section>

      <section className={styles.duo}>
        <div className={`${styles.cell} ${styles.bgGray}`}>
          <div className={styles.cellLabel}>Decentralized by default.</div>
          <div className={styles.cellNum}><span style={{fontSize: '0.6em', verticalAlign: 'middle'}}>On-chain</span></div>
        </div>
        <div className={`${styles.cell} ${styles.bgOrange}`}>
          <div className={styles.cellLabel}>04 / Trustless. Yours.</div>
          <div>
            <div className={styles.cellHeadline}>On-chain. Trustless. Yours.</div>
            <div className={styles.cellBody}>Every trade settles via smart contracts. Your shares are yours &mdash; not held in a custodial account. Withdraw, transfer, or hold them on-chain like any other digital asset.</div>
          </div>
        </div>
      </section>

      <section className={styles.how}>
        <div className={styles.howLabel}>&#x2605; How it works &rarr;</div>
        <div className={styles.howGrid}>
          <div className={styles.howStep}>
            <div className={styles.howNum}>01</div>
            <div className={styles.howTitle}>Pick a market.</div>
            <div className={styles.howDesc}>Browse questions across sports, politics, crypto, and your local community. Or create a new market yourself.</div>
          </div>
          <div className={styles.howStep}>
            <div className={styles.howNum}>02</div>
            <div className={styles.howTitle}>Buy an outcome.</div>
            <div className={styles.howDesc}>Each outcome share costs between 1&cent; and 99&cent;. Binary markets have two sides. Range markets have UP/DOWN. Multi markets have many. Smart contracts settle every trade on-chain.</div>
          </div>
          <div className={styles.howStep}>
            <div className={styles.howNum}>03</div>
            <div className={styles.howTitle}>Wait for resolution.</div>
            <div className={styles.howDesc}>The community jury settles the outcome publicly. No central oracle. No surprises.</div>
          </div>
          <div className={styles.howStep}>
            <div className={styles.howNum}>04</div>
            <div className={styles.howTitle}>Collect your winnings.</div>
            <div className={styles.howDesc}>Winning shares pay out at $1.00. Your accuracy builds a track record. The best predictors earn reputation and rewards.</div>
          </div>
        </div>
      </section>

      <section className={styles.founder}>
        <div className={styles.founderGrid}>
          <div>
            <div className={styles.founderLabel}>&#x2605; A note from the founder</div>
            <div className={styles.founderMeta}>
              <strong>Liben</strong><br/>
              Founder, Prophit<br/>
              Addis Ababa, Ethiopia
            </div>
          </div>
          <div className={styles.founderBody}>
            <p>I built Prophit because the markets I wanted to trade didn&apos;t exist.</p>
            <p>The 2024 election made prediction markets a household name &mdash; but only if you live in the right country. There&apos;s no platform that&apos;ll let you trade <em>Osimhen for AFCON top scorer</em>, or whether load-shedding ends in Joburg by December, or who wins the next election in Nairobi.</p>
            <p>Not because no one cares. Half a continent argues about these things every day. The reason is harder: no global oracle can settle a hyper-local event. So no global platform will list them.</p>
            <p>Prophit takes the standard decentralized-market model and adds one missing layer &mdash; a jury for the markets oracles can&apos;t reach. On-chain. Decentralized. Made for the next billions.</p>
            <div className={styles.founderSig}>&mdash; Liben</div>
            <div className={styles.founderSigSub}>liben@makeprophit.com &middot; @makeprophit</div>
          </div>
        </div>
      </section>

      <section className={styles.roadmap}>
        <div className={styles.roadmapHead}>
          <div>
            <div className={styles.roadmapLabel}>&#x2605; Where we are &rarr;</div>
            <div className={styles.roadmapTitle}>The <em>road</em> ahead.</div>
          </div>
        </div>
        <div className={styles.roadmapGrid}>
          <div className={styles.rmCol}>
            <div className={`${styles.rmStage} ${styles.rmStageLive}`}><span className={styles.blip}></span>Live now</div>
            <div className={styles.rmList}>
              <div className={styles.rmItem}><span className={styles.check}>&#10003;</span>On-chain trading via smart contracts</div>
              <div className={styles.rmItem}><span className={styles.check}>&#10003;</span>Decentralized oracle resolution</div>
              <div className={styles.rmItem}><span className={styles.check}>&#10003;</span>Building the Testnet in stealth</div>
              <div className={styles.rmItem}><span className={styles.check}>&#10003;</span>Swipe-to-trade Quick View</div>
              <div className={styles.rmItem}><span className={styles.check}>&#10003;</span>Creator-built markets</div>
              <div className={styles.rmItem}><span className={styles.check}>&#10003;</span>Community jury (for local markets)</div>
              <div className={styles.rmItem}><span className={styles.check}>&#10003;</span>Native sharing &amp; embeds</div>
              <div className={styles.rmItem}><span className={styles.check}>&#10003;</span>Agent-native API</div>
            </div>
          </div>
          <div className={styles.rmCol}>
            <div className={`${styles.rmStage} ${styles.rmStageNext}`}><span className={styles.blip}></span>Up next</div>
            <div className={styles.rmList}>
              <div className={`${styles.rmItem} ${styles.rmItemFuture}`}><span className={styles.check}>&rarr;</span>Testnet Reveal &amp; Early Access</div>
              <div className={`${styles.rmItem} ${styles.rmItemFuture}`}><span className={styles.check}>&rarr;</span>First 10 community design partners</div>
              <div className={`${styles.rmItem} ${styles.rmItemFuture}`}><span className={styles.check}>&rarr;</span>Mobile money on/off ramps</div>
              <div className={`${styles.rmItem} ${styles.rmItemFuture}`}><span className={styles.check}>&rarr;</span>Creator dashboards &amp; payouts</div>
              <div className={`${styles.rmItem} ${styles.rmItemFuture}`}><span className={styles.check}>&rarr;</span>Read-only MCP server</div>
              <div className={`${styles.rmItem} ${styles.rmItemFuture}`}><span className={styles.check}>&rarr;</span>Reputation graph v1</div>
            </div>
          </div>
          <div className={styles.rmCol}>
            <div className={`${styles.rmStage} ${styles.rmStageLater}`}><span className={styles.blip}></span>Later</div>
            <div className={styles.rmList}>
              <div className={`${styles.rmItem} ${styles.rmItemFuture}`}><span className={styles.check}>&rarr;</span>Mainnet launch</div>
              <div className={`${styles.rmItem} ${styles.rmItemFuture}`}><span className={styles.check}>&rarr;</span>AI-proposed market resolution</div>
              <div className={`${styles.rmItem} ${styles.rmItemFuture}`}><span className={styles.check}>&rarr;</span>Hybrid oracle (agent + jury)</div>
              <div className={`${styles.rmItem} ${styles.rmItemFuture}`}><span className={styles.check}>&rarr;</span>Cross-community shared liquidity</div>
              <div className={`${styles.rmItem} ${styles.rmItemFuture}`}><span className={styles.check}>&rarr;</span>Resolution layer as licensable infrastructure</div>
              <div className={`${styles.rmItem} ${styles.rmItemFuture}`}><span className={styles.check}>&rarr;</span>Expansion beyond Africa</div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.wall}>
        <div className={styles.wallLabel}>&#x2605; Communities launching in Testnet &rarr;</div>
        <div className={styles.wallList}>
          <div className={styles.wallItem}><span className={styles.flag}>&#x1F1F3;&#x1F1EC;</span>Naija Markets<span className={styles.tally}>2,100 waiting</span></div>
          <div className={styles.wallItem}><span className={styles.flag}>&#x1F1F0;&#x1F1EA;</span>Kenyan Pulse<span className={styles.tally}>870 waiting</span></div>
          <div className={styles.wallItem}><span className={styles.flag}>&#x1F1FF;&#x1F1E6;</span>SA Predict<span className={styles.tally}>1,340 waiting</span></div>
          <div className={styles.wallItem}><span className={styles.flag}>&#x1F1EA;&#x1F1F9;</span>Habesha Markets<span className={styles.tally}>620 waiting</span></div>
          <div className={styles.wallItem}><span className={styles.flag}>&#x1F1EC;&#x1F1ED;</span>Ghana Calls<span className={styles.tally}>490 waiting</span></div>

        </div>
      </section>

      <section className={styles.faq}>
        <div className={styles.faqHead}>
          <div className={styles.faqLabel}>&#x2605; Questions, answered</div>
          <div className={styles.faqTitle}>Frequently <em>asked.</em></div>
        </div>
        <div className={styles.faqList}>
          <div className={`${styles.faqItem} ${openFaq === 9 ? styles.faqItemOpen : ''}`} onClick={() => setOpenFaq(openFaq === 9 ? null : 9)}>
            <div className={styles.faqQ}>
              <div className={styles.faqQt}>How is Prophit different from existing prediction markets?</div>
              <div className={styles.faqToggle}>+</div>
            </div>
            <div className={styles.faqA}>Same primitive. Same on-chain mechanics. Same oracle-based resolution for global markets. The difference is that Prophit adds a second resolution path &mdash; a community jury &mdash; for hyper-local markets that no decentralized oracle can settle. Polymarket can&apos;t list "who won the council seat in Lagos" because no UMA optimistic oracle can verify it. Prophit can, because the community can.</div>
          </div>
          <div className={`${styles.faqItem} ${openFaq === 1 ? styles.faqItemOpen : ''}`} onClick={() => setOpenFaq(openFaq === 1 ? null : 1)}>
            <div className={styles.faqQ}>
              <div className={styles.faqQt}>When does Prophit launch?</div>
              <div className={styles.faqToggle}>+</div>
            </div>
            <div className={styles.faqA}>We&apos;re putting the finishing touches on our Testnet right now. Join the waitlist above to secure your spot &mdash; we&apos;ll be sending out access invites soon. Mainnet will follow once the mechanics are battle-tested.</div>
          </div>
          <div className={`${styles.faqItem} ${openFaq === 10 ? styles.faqItemOpen : ''}`} onClick={() => setOpenFaq(openFaq === 10 ? null : 10)}>
            <div className={styles.faqQ}>
              <div className={styles.faqQt}>Is Prophit really decentralized?</div>
              <div className={styles.faqToggle}>+</div>
            </div>
            <div className={styles.faqA}>Yes. Every trade is settled on-chain by smart contracts. Your shares are yours &mdash; held in your wallet, withdrawable any time. Communities, market creation, and jury voting all operate on-chain. We don&apos;t custody funds.</div>
          </div>
          <div className={`${styles.faqItem} ${openFaq === 2 ? styles.faqItemOpen : ''}`} onClick={() => setOpenFaq(openFaq === 2 ? null : 2)}>
            <div className={styles.faqQ}>
              <div className={styles.faqQt}>Do I need crypto to use Prophit?</div>
              <div className={styles.faqToggle}>+</div>
            </div>
            <div className={styles.faqA}>No. We&apos;re building for the next billion users, and most of them have never touched a wallet. Onboarding works with email and mobile money where available &mdash; we handle the rest under the hood. You can also use crypto if you prefer.</div>
          </div>
          <div className={`${styles.faqItem} ${openFaq === 3 ? styles.faqItemOpen : ''}`} onClick={() => setOpenFaq(openFaq === 3 ? null : 3)}>
            <div className={styles.faqQ}>
              <div className={styles.faqQt}>Is this gambling? Is it legal where I live?</div>
              <div className={styles.faqToggle}>+</div>
            </div>
            <div className={styles.faqA}>Prediction markets and sports betting are regulated differently in every country. We operate as a Delaware C-corp, geoblock where required, and apply KYC thresholds in line with each jurisdiction. The short answer: check your local laws, and we won&apos;t let you in if it&apos;s not allowed.</div>
          </div>
          <div className={`${styles.faqItem} ${openFaq === 5 ? styles.faqItemOpen : ''}`} onClick={() => setOpenFaq(openFaq === 5 ? null : 5)}>
            <div className={styles.faqQ}>
              <div className={styles.faqQt}>How do markets get resolved?</div>
              <div className={styles.faqToggle}>+</div>
            </div>
            <div className={styles.faqA}>Two paths. Global and well-documented markets (elections, sports, crypto prices) resolve via decentralized oracle &mdash; same model as Polymarket. Community-owned markets resolve via community jury: 1&ndash;10 elected members of that community review the outcome publicly and vote. Supermajority required. All reasoning on the record.</div>
          </div>
          <div className={`${styles.faqItem} ${openFaq === 6 ? styles.faqItemOpen : ''}`} onClick={() => setOpenFaq(openFaq === 6 ? null : 6)}>
            <div className={styles.faqQ}>
              <div className={styles.faqQt}>Can I create my own market?</div>
              <div className={styles.faqToggle}>+</div>
            </div>
            <div className={styles.faqA}>Yes. Anyone can start a community and create markets in it. You set the question, the deadline, and the resolution criteria. Markets pass through a quick moderation queue before going live. You earn 50% of every trading fee your market generates.</div>
          </div>
          <div className={`${styles.faqItem} ${openFaq === 8 ? styles.faqItemOpen : ''}`} onClick={() => setOpenFaq(openFaq === 8 ? null : 8)}>
            <div className={styles.faqQ}>
              <div className={styles.faqQt}>How do I get early access?</div>
              <div className={styles.faqToggle}>+</div>
            </div>
            <div className={styles.faqA}>Join the Telegram community. It&apos;s the best place to get access to the Testnet when it drops, find other traders, and get direct access to the team. Link&apos;s in the footer.</div>
          </div>
        </div>
      </section>

      <section className={styles.signup}>
        <div className={styles.signupGrid}>
          <div>
            <div className={styles.signupEyebrow}>&#x2605; Early Access</div>
            <div className={styles.signupHead}>Get in<br/><em>early.</em></div>
          </div>
          <div className={styles.signupFormblock}>
            <p className={styles.signupSub}>Join 1,247 traders, creators, and community builders on the waitlist. We&apos;ll hit you before the Testnet opens. No spam, ever.</p>

            {status !== 'success' && step === 1 && (
              <div className={`${styles.step} ${styles.stepActive}`}>
                <div className={styles.emailRow}>
                  <input 
                    type="text" 
                    placeholder="Your Name" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={(!name.trim() && name !== '') ? { borderColor: '#FF4B4B'} : {}}
                  />
                  <input 
                    type="email" 
                    placeholder="your@email.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={(!email || !email.includes('@')) && email.length > 0 ? { borderColor: '#FF4B4B'} : {}}
                  />
                  <button className={styles.btnY} onClick={handleNextStep}>Join &rarr;</button>
                </div>
              </div>
            )}

            {status !== 'success' && step === 2 && (
              <div className={`${styles.step} ${styles.stepActive}`}>
                <div className={styles.s2Q}>I&apos;m here to &mdash;</div>
                <div className={styles.pills}>
                  <button className={`${styles.pill} ${role === 'trade' ? styles.pillOn : ''}`} onClick={() => setRole('trade')}>Trade markets</button>
                  <button className={`${styles.pill} ${role === 'create' ? styles.pillOn : ''}`} onClick={() => setRole('create')}>Create markets</button>
                  <button className={`${styles.pill} ${role === 'community' ? styles.pillOn : ''}`} onClick={() => setRole('community')}>Run a community</button>
                  <button className={`${styles.pill} ${role === 'build' ? styles.pillOn : ''}`} onClick={() => setRole('build')}>Build on the API</button>
                </div>
                <div className={styles.s2Q}>I&apos;m based in &mdash;</div>
                <div className={styles.selectW}>
                  <select value={country} onChange={(e) => setCountry(e.target.value)}>
                    <option value="" disabled>Select your country</option>
                    <option value="Nigeria">Nigeria</option>
                    <option value="Kenya">Kenya</option>
                    <option value="South Africa">South Africa</option>
                    <option value="Ethiopia">Ethiopia</option>
                    <option value="Ghana">Ghana</option>
                    <option value="Tanzania">Tanzania</option>
                    <option value="Uganda">Uganda</option>
                    <option value="Egypt">Egypt</option>
                    <option value="Morocco">Morocco</option>
                    <option value="other-af">Other African country</option>
                    <option value="other">Outside Africa</option>
                  </select>
                  <span className={styles.selArr}>&#9662;</span>
                </div>
                {status === 'error' && <p className={styles.fnote} style={{color: '#FF4B4B'}}>Something went wrong. Try again.</p>}
                <div className={styles.btnRow}>
                  <button className={styles.btnBack} onClick={() => setStep(1)} disabled={status === 'loading'}>&larr; Back</button>
                  <button className={styles.btnSub} onClick={handleSubmit} disabled={status === 'loading'}>
                    {status === 'loading' ? 'Joining...' : 'Secure My Spot \u2192'}
                  </button>
                </div>
              </div>
            )}

            {status === 'success' && (
              <div className={styles.successBox}>
                <div className={styles.successH}>You&apos;re on the list.</div>
                <div className={styles.successB}>We&apos;ll hit you before the Testnet goes live. Jump into Telegram in the meantime to connect with the earliest community members.</div>
              </div>
            )}

            {status !== 'success' && <p className={styles.fnote}>No spam. One message when we launch. Free to join.</p>}
          </div>
        </div>
      </section>

      <div className={styles.footerMark}>
        <div className={styles.footerBigmark}>Pro<em>ph</em>it</div>
      </div>

      <div className={styles.footerBottom}>
        <div className={styles.fbCol}>
          <div className={styles.fbH}>Let&apos;s talk.</div>
          <p>For traders and creators, hit us up at <a href="mailto:hello@makeprophit.com">hello@makeprophit.com</a>.</p>
          <p style={{marginTop: '10px'}}>For partnerships and press, reach <a href="mailto:liben@makeprophit.com">liben@makeprophit.com</a>.</p>
        </div>
        <div className={styles.fbCol}>
          <div className={styles.fbH}>Communities</div>
          <div className={styles.fbList}>
            <a href="#">Naija Markets</a>
            <a href="#">Kenyan Pulse</a>
            <a href="#">SA Predict</a>
            <a href="#">Habesha Markets</a>

          </div>
        </div>
        <div className={styles.fbCol}>
          <div className={styles.fbH}>Read our mind</div>
          <div className={styles.fbList}>
            <a href="https://twitter.com/makeprophit">Twitter &#8599;</a>
            <a href="https://t.me/+t_ka6vpwklQ5NDg8">Telegram &#8599;</a>
            <a href="https://makeprophit.com">makeprophit.com &#8599;</a>
          </div>
        </div>
      </div>

      <div className={styles.fbCopy}>
        <span>&copy; Prophit 2026</span>
        <span>Smart contracts &middot; 100% On-chain</span>
      </div>
    </div>
  )
}
