import React, { useContext } from 'react'
import { useSelector } from 'react-redux'
import SVG from 'react-inlinesvg'

import { NavigationContext } from 'contexts'
import { apiSelector } from 'selectors'
import { NOOP } from 'utils'
import { useMediaQuery } from 'hooks'
import { MobileNav } from 'ui'

import { device } from 'styles/media'
import * as S from './styled'

type Props = {
  forceShowSidebar?: boolean
  children: React.ReactNode[] | React.ReactNode | string
}

const DefaultLayout = ({ forceShowSidebar, children }: Props) => {
  const api = useSelector(apiSelector)
  const whenContextIsAvailable = useContext(NavigationContext)
  const { navigateTo } = forceShowSidebar
    ? { navigateTo: NOOP }
    : whenContextIsAvailable
  const isDesktop = useMediaQuery(device.lg)

  const links = [
    {
      name: 'Switch Node',
      icon: '/icons/settings.svg',
      href: '/'
    },
    {
      name: 'Staking',
      icon: '/icons/safe.svg',
      href: '/staking'
    },
    {
      name: 'Contact',
      icon: '/icons/mail.svg',
      href: '/contact'
    }
  ]

  return (
    <S.Wrapper isDesktop={isDesktop}>
      {(forceShowSidebar || api.loaded) &&
        (isDesktop ? (
          <S.Sidebar>
            <S.Logo src="/images/logo.svg" onClick={() => navigateTo('/')} />
            <nav>
              {links.map((item, idx) => (
                <S.MenuLink
                  key={`menuLink-${idx}`}
                  to={item.href}
                  activeClassName="active"
                  exact
                >
                  <SVG src={item.icon}>
                    <img src={item.icon} alt={item.href} />
                  </SVG>
                  <div>{item.name}</div>
                </S.MenuLink>
              ))}
            </nav>
          </S.Sidebar>
        ) : (
          <MobileNav links={links} forceShowSidebar={forceShowSidebar} />
        ))}
      <S.Content apiLoaded={api.loaded}>{children}</S.Content>
    </S.Wrapper>
  )
}

export default DefaultLayout