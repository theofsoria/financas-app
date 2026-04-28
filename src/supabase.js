import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://isnfpxvmnlwsifjmvsjv.supabase.co'
const supabaseKey = 'sb_publishable_OMRI5Qaub3asq4jz-beY_Q_wyNItbsy'

export const supabase = createClient(supabaseUrl, supabaseKey)