/**
 * 파생 값 검사층.
 *
 * V1 은 인증 작성의 한 줄 카운터가 입력 0자 · maxlength 60 인데 40 을 표시했고,
 * Playwright 210건이 그걸 못 잡았다. 카운터가 **존재하는지**만 보고
 * **값이 입력과 일치하는지**는 보지 않았기 때문이다.
 *
 * 그래서 이 파일은 "보이는가"가 아니라 "따라 변하는가"를 검사한다.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../app/AppProvider';
import { ComposeScreen } from '../screens/ComposeScreen';
import { RecordScreen } from '../screens/RecordScreen';
import { POLICY_V1 } from '../../domain/policies';

function mount(ui: React.ReactNode, path = '/') {
  localStorage.clear();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>{ui}</AppProvider>
    </MemoryRouter>,
  );
}

describe('한 줄 카운터는 입력에서 파생된다', () => {
  it('입력 길이를 따라 변한다', () => {
    mount(<ComposeScreen />);
    const input = screen.getByLabelText('오늘의 한 줄');

    const max = POLICY_V1.textMaxLength;
    expect(screen.getByText(`0 / ${max}`)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '오늘도 읽었다' } });
    expect(screen.getByText(`7 / ${max}`)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByText(`0 / ${max}`)).toBeInTheDocument();
  });

  it('한 줄 길이 제한은 정책에서 온다 — 화면이 숫자를 따로 갖지 않는다', () => {
    mount(<ComposeScreen />);
    expect(screen.getByLabelText('오늘의 한 줄'))
      .toHaveAttribute('maxlength', String(POLICY_V1.textMaxLength));
  });

  it('빈 입력으로는 인증을 남길 수 없다', () => {
    mount(<ComposeScreen />);
    const submit = screen.getByRole('button', { name: '인증 남기기' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('오늘의 한 줄'), { target: { value: '한 줄' } });
    expect(submit).toBeEnabled();
  });
});

describe('66칸 진행판은 목록과 이어져 있다', () => {
  it('칸의 이름표가 그날의 실제 상태를 말한다', () => {
    mount(<RecordScreen />);
    // 데모 시드 — 6일차 면제권, 13일차 미인증, 9일차 늦은 인증
    expect(screen.getByLabelText('6일차, 면제권')).toBeInTheDocument();
    expect(screen.getByLabelText('13일차, 미인증')).toBeInTheDocument();
    expect(screen.getByLabelText('9일차, 늦은 인증')).toBeInTheDocument();
    expect(screen.getByLabelText('23일차, 오늘')).toBeInTheDocument();
    expect(screen.getByLabelText('40일차, 남은 날')).toBeInTheDocument();
  });

  it('칸을 누르면 그 날짜 항목이 선택된다', () => {
    const { container } = mount(<RecordScreen />);
    fireEvent.click(screen.getByLabelText('9일차, 늦은 인증'));

    const selected = container.querySelector('.record.is-selected');
    expect(selected).not.toBeNull();
    expect(within(selected as HTMLElement).getByText('9')).toBeInTheDocument();
    expect(selected!.textContent).toContain('늦게 들어와서 자정 넘겨 읽음');
  });

  it('방향키로 옆 칸·아래 칸으로 옮겨간다', () => {
    mount(<RecordScreen />);
    const cell = screen.getByLabelText('9일차, 늦은 인증');
    fireEvent.click(cell);

    fireEvent.keyDown(cell, { key: 'ArrowRight' });
    expect(screen.getByLabelText('10일차, 인증 완료')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(cell, { key: 'ArrowDown' });  // 11칸 아래
    expect(screen.getByLabelText('21일차, 인증 완료')).toHaveAttribute('aria-pressed', 'true');
  });

  it('미래 칸은 상태를 흘리지 않는다', () => {
    mount(<RecordScreen />);
    for (const day of [24, 30, 66]) {
      expect(screen.getByLabelText(`${day}일차, 남은 날`)).toBeInTheDocument();
    }
  });
});
