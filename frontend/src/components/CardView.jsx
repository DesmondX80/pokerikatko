const SUIT_SYMBOLS = {
  HERTTA: '♥',
  RUUTU: '♦',
  RISTI: '♣',
  PATA: '♠',
}

const RANK_LABELS = {
  TWO: '2', THREE: '3', FOUR: '4', FIVE: '5', SIX: '6', SEVEN: '7',
  EIGHT: '8', NINE: '9', TEN: '10', JACK: 'J', QUEEN: 'Q', KING: 'K', ACE: 'A',
}

export default function CardView({ card, selected, disabled, onClick }) {
  if (!card) return null
  const isRed = card.suit === 'HERTTA' || card.suit === 'RUUTU'
  const classes = ['card']
  if (isRed) classes.push('red')
  if (selected) classes.push('selected')
  if (disabled) classes.push('disabled')

  return (
    <div className={classes.join(' ')} onClick={disabled ? undefined : onClick}>
      <div>{RANK_LABELS[card.rank]}</div>
      <div style={{ fontSize: '1.4em' }}>{SUIT_SYMBOLS[card.suit]}</div>
    </div>
  )
}
