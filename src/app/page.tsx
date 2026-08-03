import { redirect } from 'next/navigation'

/** Root always sends you to the dashboard; middleware bounces you to /login if signed out. */
export default function Home() {
  redirect('/dashboard')
}
