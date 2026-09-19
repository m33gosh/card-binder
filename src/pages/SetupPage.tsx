export function SetupPage() {
  return (
    <div className="login">
      <div className="panel" style={{ textAlign: 'left', maxWidth: 560 }}>
        <h1>Almost there</h1>
        <p>The app can't find its Supabase settings, so it can't sign anyone in yet.</p>
        <p>Copy <code>.env.example</code> to <code>.env.local</code> and fill in your project URL and anon key, then restart the dev server. For GitHub Pages, add the same values as repository variables. The README walks through it.</p>
      </div>
    </div>
  )
}
