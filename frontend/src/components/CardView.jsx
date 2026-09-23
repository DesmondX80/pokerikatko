import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

const SUIT_SYMBOLS = {
  HERTTA: '♥',
  RUUTU: '♦',
  RISTI: '♣',
  PATA: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
}

const RANK_LABELS = {
  TWO: '2', THREE: '3', FOUR: '4', FIVE: '5', SIX: '6', SEVEN: '7',
  EIGHT: '8', NINE: '9', TEN: '10', JACK: 'J', QUEEN: 'Q', KING: 'K', ACE: 'A',
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  J: 'J', Q: 'Q', K: 'K', A: 'A'
}

export default function CardView({ card, selected, disabled, onClick, layoutId, dealAnimation }) {
  const [revealed, setRevealed] = useState(!dealAnimation)

  useEffect(() => {
    if (dealAnimation) {
      const timer = setTimeout(() => setRevealed(true), 250)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!card) return null
  const isRed = card.suit === 'HERTTA' || card.suit === 'RUUTU' || card.suit === 'hearts' || card.suit === 'diamonds'
  const classes = ['card']
  if (isRed) classes.push('red')
  if (selected) classes.push('selected')
  if (disabled) classes.push('disabled')

  const suit = SUIT_SYMBOLS[card.suit] || card.suit || '?'
  const rank = RANK_LABELS[card.rank] || card.rank || '?'

  return (
      <motion.div
          layoutId={layoutId}
          layout
          animate={{ y: selected ? -8 : 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className={classes.join(' ')}
          onClick={disabled ? undefined : onClick}
      >
        <motion.div
            className="card-flip-inner"
            animate={{ rotateY: revealed ? 0 : 180 }}
            transition={{ duration: 0.4 }}
        >
          <div className="card-face card-face-front">
            <div className="card-corner card-corner-top">
              <div className="card-corner-rank">{rank}</div>
              <div className="card-corner-suit">{suit}</div>
            </div>
            <div className="card-center-suit">{suit}</div>
            <div className="card-corner card-corner-bottom">
              <div className="card-corner-rank">{rank}</div>
              <div className="card-corner-suit">{suit}</div>
            </div>
          </div>
          <div className="card-face card-face-back" />
        </motion.div>
      </motion.div>
  )
}

export function CardBack({ layoutId, count }) {
  return (
      <motion.div
          layoutId={layoutId}
          className="card card-static-back"
      >
        {count > 1 && <div className="deck-count">{count}</div>}
      </motion.div>
  )
}