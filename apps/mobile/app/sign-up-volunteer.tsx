import Screen from '@/screens/auth/SignUpVolunteerScreen';
import { useScreenNav } from '@/navigation/adapter';

export default function Route() {
  const { navigation, route } = useScreenNav();
  return <Screen navigation={navigation} route={route} />;
}
