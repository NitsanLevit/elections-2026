import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    return NextResponse.json({
      ok: true,
      message: 'ההימור נשמר בהצלחה',
      payload: body,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, message: 'שגיאה בעיבוד ההימור' }, { status: 400 });
  }
}
