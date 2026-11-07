// Circle with the initials of a name. Hidden from screen readers, which read the name next to it.
export default function Avatar({ name }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        flex: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: '#ffffff',
        border: '1px solid #999999',
        fontSize: 13,
        fontWeight: 'bold',
      }}
    >
      {name
        .split(' ')
        .map((word) => word[0])
        .join('')}
    </span>
  );
}
