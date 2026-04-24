import Link from 'next/link';

export default function Custom404() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px',
      fontFamily: 'Onest, sans-serif',
      background: '#0c0e16',
      color: '#e8e4dc',
      textAlign: 'center'
    }}>
      <div style={{
        fontSize: '6rem',
        marginBottom: '1rem',
        color: '#c4a882',
        fontWeight: '300'
      }}>
        404
      </div>
      <h1 style={{
        fontSize: '2rem',
        marginBottom: '1rem',
        fontWeight: '500'
      }}>
        Page Not Found
      </h1>
      <p style={{
        fontSize: '1.1rem',
        color: '#8a8fa8',
        marginBottom: '2rem',
        maxWidth: '500px',
        lineHeight: '1.6'
      }}>
        The page you are looking for does not exist. It might have been moved, deleted, or you entered the wrong URL.
      </p>
      <Link
        href="/"
        style={{
          padding: '14px 28px',
          background: '#c4a882',
          color: '#0c0e16',
          border: 'none',
          borderRadius: '8px',
          fontSize: '1.1rem',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'all 0.2s',
          textDecoration: 'none',
          display: 'inline-block'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = '#b89a72';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = '#c4a882';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        Go Home
      </Link>
    </div>
  );
}
